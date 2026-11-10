/**
 * The 15×15 board: bonus squares, tiles already played, the tiles the player
 * is composing (pending, draggable) and a highlight on the last word played.
 *
 * The whole grid is one drop zone: a dragged tile goes to the free square
 * nearest to it (highlighted while dragging). Tapping a square places the
 * selected rack tile, or sets the typing cursor (→ / ↓); tapping a pending tile
 * sends it back to the rack; tapping a played tile shows the definitions.
 */

import {
  BOARD_SIZE,
  CENTER,
  type Board,
  type Letter,
  type Position,
  type Tile,
  premiumAt,
} from '@maitremot/engine';
import { memo, useRef, useState } from 'react';
import { type HostInstance, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Cursor, PendingTile } from '../game/useGameController';
import { colors, premiumStyle } from '../ui/theme';
import { useDraggable, useDropZone } from './DragLayer';
import { TileView } from './TileView';

interface Props {
  readonly board: Board;
  readonly pending: readonly PendingTile[];
  readonly tileById: ReadonlyMap<number, Tile>;
  /** Squares of the last word played, highlighted. */
  readonly lastMove: ReadonlySet<string>;
  readonly squareSize: number;
  readonly interactive: boolean;
  readonly cursor: Cursor | null;
  /** Whether a tile (`tileId`, which may already be on the board) can go on `pos`. */
  readonly isFree: (pos: Position, tileId?: number) => boolean;
  readonly onSquarePress: (pos: Position) => void;
  /** Tap on a tile already played (to show the definitions of its words). */
  readonly onPlayedTilePress: (pos: Position) => void;
  readonly onDropTile: (tileId: number, pos: Position) => void;
}

const key = (row: number, col: number) => `${row},${col}`;

/** How far (in squares) from the drop point we look for a free square. */
const MAX_SNAP_DISTANCE = 1.3;

export function BoardView(props: Props) {
  const { board, pending, tileById, lastMove, squareSize, interactive } = props;
  const gridRef = useRef<HostInstance>(null);
  const [hover, setHover] = useState<Position | null>(null);

  /**
   * The free square closest to a point (in pixels, relative to the grid). The
   * square under the point wins when it is free; otherwise the nearest free
   * neighbor, so a tile released on an occupied square still lands nearby.
   */
  const nearestFree = (x: number, y: number, tileId: number): Position | null => {
    const fx = x / squareSize;
    const fy = y / squareSize;
    let best: Position | null = null;
    let bestDistance = MAX_SNAP_DISTANCE;
    for (let row = Math.floor(fy) - 1; row <= Math.floor(fy) + 1; row++) {
      for (let col = Math.floor(fx) - 1; col <= Math.floor(fx) + 1; col++) {
        const distance = Math.hypot(col + 0.5 - fx, row + 0.5 - fy);
        if (distance < bestDistance && props.isFree({ row, col }, tileId)) {
          best = { row, col };
          bestDistance = distance;
        }
      }
    }
    return best;
  };

  useDropZone(
    'board',
    gridRef,
    (item, x, y) => {
      setHover(null);
      const pos = nearestFree(x, y, item.tileId);
      if (pos) props.onDropTile(item.tileId, pos);
    },
    (item, point) => {
      const pos = point && interactive ? nearestFree(point.x, point.y, item.tileId) : null;
      // Only re-render when the highlighted square changes.
      setHover((current) =>
        current?.row === pos?.row && current?.col === pos?.col ? current : pos,
      );
    },
  );

  const pendingAt = new Map(pending.map((p) => [key(p.pos.row, p.pos.col), p]));

  return (
    <View
      ref={gridRef}
      testID="board"
      style={{ width: squareSize * BOARD_SIZE, height: squareSize * BOARD_SIZE }}
    >
      {board.map((cells, row) => (
        <View key={row} style={styles.row}>
          {cells.map((cell, col) => {
            const k = key(row, col);
            const p = pendingAt.get(k);
            const tile = p ? tileById.get(p.tileId) : undefined;
            return (
              <Pressable
                key={col}
                onPress={() =>
                  cell ? props.onPlayedTilePress({ row, col }) : props.onSquarePress({ row, col })
                }
                // Played tiles can always be tapped (definitions), even during others' turns.
                disabled={cell === null && !interactive}
                style={{ width: squareSize, height: squareSize }}
              >
                {cell ? (
                  <TileView
                    letter={cell.letter}
                    isBlank={cell.isBlank}
                    size={squareSize}
                    variant={lastMove.has(k) ? 'lastMove' : 'normal'}
                  />
                ) : p && tile ? (
                  <PendingTileView
                    tileId={p.tileId}
                    letter={(p.letter ?? tile.letter)!}
                    isBlank={tile.letter === null}
                    size={squareSize}
                    enabled={interactive}
                  />
                ) : (
                  <Square
                    row={row}
                    col={col}
                    size={squareSize}
                    highlighted={hover?.row === row && hover.col === col}
                    cursor={
                      props.cursor?.pos.row === row && props.cursor.pos.col === col
                        ? props.cursor.direction
                        : null
                    }
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * An empty square, with its bonus label, the drag highlight or the typing
 * cursor. Memoized: there are 225 of them.
 */
const Square = memo(function Square({
  row,
  col,
  size,
  highlighted,
  cursor,
}: {
  row: number;
  col: number;
  size: number;
  highlighted: boolean;
  cursor: Cursor['direction'] | null;
}) {
  const premium = premiumAt({ row, col });
  const isCenter = row === CENTER && col === CENTER;
  return (
    <View
      style={[
        styles.square,
        { width: size, height: size },
        premium && { backgroundColor: premiumStyle[premium].color },
        isCenter && { backgroundColor: colors.center },
        (highlighted || cursor) && styles.target,
      ]}
    >
      {cursor ? (
        <Text allowFontScaling={false} style={[styles.cursor, { fontSize: size * 0.6 }]}>
          {cursor === 'horizontal' ? '→' : '↓'}
        </Text>
      ) : (
        <Text allowFontScaling={false} style={[styles.label, { fontSize: size * 0.27 }]}>
          {isCenter ? '★' : premium ? premiumStyle[premium].label : ''}
        </Text>
      )}
    </View>
  );
});

function PendingTileView(props: {
  tileId: number;
  letter: Letter;
  isBlank: boolean;
  size: number;
  enabled: boolean;
}) {
  const preview = (
    <TileView
      letter={props.letter}
      isBlank={props.isBlank}
      size={props.size * 1.4}
      variant="pending"
    />
  );
  const { panHandlers, isDragging } = useDraggable(
    { tileId: props.tileId, from: 'board' },
    preview,
    props.size * 1.4,
    props.enabled,
  );
  return (
    <View {...panHandlers}>
      <TileView
        letter={props.letter}
        isBlank={props.isBlank}
        size={props.size}
        variant="pending"
        faded={isDragging}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  square: {
    backgroundColor: colors.square,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.squareBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.text, fontWeight: '600', opacity: 0.8 },
  target: { borderWidth: 2, borderColor: colors.selected },
  cursor: { color: colors.selected, fontWeight: '800' },
});
