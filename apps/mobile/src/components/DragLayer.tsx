/**
 * Drag & drop of tiles, built on React Native's own PanResponder + Animated
 * (no extra native library, works the same on iOS, Android and web).
 *
 * How it works:
 * - `DragProvider` wraps the game screen. It draws the tile being dragged in an
 *   overlay, above everything, following the finger.
 * - Drop zones (the board, the rack) register themselves with `useDropZone`.
 *   When a drag starts, every zone is measured on screen; when the finger is
 *   released, the zone under it receives the tile with the drop coordinates
 *   relative to the zone.
 * - `useDraggable` gives a tile the touch handlers. A drag only starts after
 *   the finger moved a few pixels, so a simple tap still works as a tap.
 */

import {
  type ReactNode,
  type RefObject,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, type HostInstance, PanResponder, StyleSheet, View } from 'react-native';

/** What is being dragged. */
export interface DragItem {
  readonly tileId: number;
  readonly from: 'rack' | 'board';
}

type DropHandler = (item: DragItem, x: number, y: number) => void;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Zone {
  ref: RefObject<HostInstance | null>;
  onDrop: DropHandler;
  rect?: Rect;
}

interface DragContextValue {
  start(item: DragItem, preview: ReactNode, size: number, pageX: number, pageY: number): void;
  move(pageX: number, pageY: number): void;
  end(pageX: number, pageY: number): void;
  cancel(): void;
  zones: Map<string, Zone>;
  draggingId: number | null;
}

const DragContext = createContext<DragContextValue | null>(null);

function useDragContext(): DragContextValue {
  const context = useContext(DragContext);
  if (!context) throw new Error('Drag components must be inside a DragProvider');
  return context;
}

/** Measures a view in window coordinates. */
function measure(view: HostInstance | null): Promise<Rect | undefined> {
  return new Promise((resolve) => {
    if (!view) return resolve(undefined);
    view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}

export function DragProvider({ children }: { children: ReactNode }) {
  const rootRef = useRef<HostInstance>(null);
  const rootOffset = useRef({ x: 0, y: 0 });
  const position = useRef(new Animated.ValueXY()).current;
  const zones = useRef(new Map<string, Zone>()).current;
  const current = useRef<{ item: DragItem; size: number } | null>(null);
  const [drag, setDrag] = useState<{ item: DragItem; preview: ReactNode; size: number } | null>(
    null,
  );

  const value = useMemo<DragContextValue>(() => {
    const place = (pageX: number, pageY: number) => {
      const size = current.current?.size ?? 0;
      // Center the tile on the finger, slightly above it so it stays visible.
      position.setValue({
        x: pageX - rootOffset.current.x - size / 2,
        y: pageY - rootOffset.current.y - size * 0.9,
      });
    };
    return {
      zones,
      draggingId: null,
      start(item, preview, size, pageX, pageY) {
        current.current = { item, size };
        setDrag({ item, preview, size });
        place(pageX, pageY);
        // Measure the root and the drop zones once, at the start of the drag.
        void measure(rootRef.current).then((rect) => {
          if (rect) rootOffset.current = { x: rect.x, y: rect.y };
          place(pageX, pageY);
        });
        for (const zone of zones.values()) {
          void measure(zone.ref.current).then((rect) => {
            if (rect) zone.rect = rect;
          });
        }
      },
      move: place,
      end(pageX, pageY) {
        const dragged = current.current;
        current.current = null;
        setDrag(null);
        if (!dragged) return;
        for (const zone of zones.values()) {
          const r = zone.rect;
          if (
            r &&
            pageX >= r.x &&
            pageX <= r.x + r.width &&
            pageY >= r.y &&
            pageY <= r.y + r.height
          ) {
            zone.onDrop(dragged.item, pageX - r.x, pageY - r.y);
            return;
          }
        }
      },
      cancel() {
        current.current = null;
        setDrag(null);
      },
    };
  }, [position, zones]);

  const contextValue = useMemo(
    () => ({ ...value, draggingId: drag?.item.tileId ?? null }),
    [value, drag],
  );

  return (
    <DragContext.Provider value={contextValue}>
      <View ref={rootRef} style={styles.root}>
        {children}
        {drag && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.overlay,
              { width: drag.size, height: drag.size, transform: position.getTranslateTransform() },
            ]}
          >
            {drag.preview}
          </Animated.View>
        )}
      </View>
    </DragContext.Provider>
  );
}

/** Registers a view as a drop target. `onDrop` gets coordinates relative to the view. */
export function useDropZone(
  name: string,
  ref: RefObject<HostInstance | null>,
  onDrop: DropHandler,
) {
  const { zones } = useDragContext();
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  useEffect(() => {
    zones.set(name, { ref, onDrop: (...args) => onDropRef.current(...args) });
    return () => {
      zones.delete(name);
    };
  }, [name, ref, zones]);
}

/**
 * Touch handlers making a view draggable.
 * @param preview what to draw under the finger while dragging
 * @param size    size of the preview, in pixels
 */
export function useDraggable(item: DragItem, preview: ReactNode, size: number, enabled: boolean) {
  const context = useDragContext();
  const latest = useRef({ item, preview, size, enabled, context });
  latest.current = { item, preview, size, enabled, context };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // Only take over the touch once the finger really moves (keeps taps working).
        onMoveShouldSetPanResponder: (_, g) =>
          latest.current.enabled && Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderGrant: (_, g) => {
          const { item, preview, size, context } = latest.current;
          context.start(item, preview, size, g.x0, g.y0);
        },
        onPanResponderMove: (_, g) => latest.current.context.move(g.moveX, g.moveY),
        onPanResponderRelease: (_, g) => latest.current.context.end(g.moveX, g.moveY),
        onPanResponderTerminate: () => latest.current.context.cancel(),
        // Do not let a parent (e.g. a ScrollView) steal the drag once started.
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  return { panHandlers: responder.panHandlers, isDragging: context.draggingId === item.tileId };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { position: 'absolute', left: 0, top: 0, zIndex: 100, elevation: 10 },
});
