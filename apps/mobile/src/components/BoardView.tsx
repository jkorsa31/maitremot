/**
 * The 15×15 board: bonus squares, tiles already played, the tiles the player
 * is composing (pending, draggable) and a highlight on the last word played.
 *
 * The whole grid is one drop zone: a dropped tile goes to the square under the
 * finger. Tapping a square places the selected rack tile; tapping a pending
 * tile sends it back to the rack.
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
import { memo, useRef } from 'react';
import { type HostInstance, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PendingTile } from '../game/useSoloGame';
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
  readonly onSquarePress: (pos: Position) => void;
  readonly onDropTile: (tileId: number, pos: Position) => void;
}

const key = (row: number, col: number) => `${row},${col}`;

export function BoardView(props: Props) {
  const { board, pending, tileById, lastMove, squareSize, interactive } = props;
  const gridRef = useRef<HostInstance>(null);

  useDropZone('board', gridRef, (item, x, y) => {
    const pos = { row: Math.floor(y / squareSize), col: Math.floor(x / squareSize) };
    if (pos.row >= 0 && pos.row < BOARD_SIZE && pos.col >= 0 && pos.col < BOARD_SIZE) {
      props.onDropTile(item.tileId, pos);
    }
  });

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
                onPress={() => props.onSquarePress({ row, col })}
                disabled={!interactive || cell !== null}
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
                  <Square row={row} col={col} size={squareSize} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** An empty square, with its bonus label. Memoized: there are 225 of them. */
const Square = memo(function Square({
  row,
  col,
  size,
}: {
  row: number;
  col: number;
  size: number;
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
      ]}
    >
      <Text allowFontScaling={false} style={[styles.label, { fontSize: size * 0.27 }]}>
        {isCenter ? '★' : premium ? premiumStyle[premium].label : ''}
      </Text>
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
});
