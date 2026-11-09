/**
 * The player's rack: up to 7 tiles. Tap a tile to select it (then tap a
 * square), or drag it onto the board. Dropping a tile on the rack puts it back
 * (from the board) or moves it to another slot (to rearrange the letters).
 */

import type { Tile } from '@maitremot/engine';
import { useRef } from 'react';
import { type HostInstance, Pressable, StyleSheet, View } from 'react-native';
import { radius } from '../ui/theme';
import { useDraggable, useDropZone } from './DragLayer';
import { TileView } from './TileView';

interface Props {
  readonly tiles: readonly Tile[];
  readonly tileSize: number;
  readonly selectedTileId: number | null;
  readonly interactive: boolean;
  readonly onSelect: (tileId: number) => void;
  /** A tile was dropped on the rack, at visible slot `index`. */
  readonly onDropTile: (tileId: number, from: 'rack' | 'board', index: number) => void;
}

const GAP = 6;

export function RackView({
  tiles,
  tileSize,
  selectedTileId,
  interactive,
  onSelect,
  onDropTile,
}: Props) {
  const ref = useRef<HostInstance>(null);

  useDropZone('rack', ref, (item, x) => {
    const index = Math.floor((x - GAP) / (tileSize + GAP));
    onDropTile(item.tileId, item.from, Math.max(0, index));
  });

  return (
    <View
      ref={ref}
      testID="rack"
      style={[
        styles.rack,
        { minHeight: tileSize + 2 * GAP + 8, width: 7 * (tileSize + GAP) + GAP },
      ]}
    >
      {tiles.map((tile) => (
        <RackTile
          key={tile.id}
          tile={tile}
          size={tileSize}
          selected={tile.id === selectedTileId}
          interactive={interactive}
          onPress={() => onSelect(tile.id)}
        />
      ))}
    </View>
  );
}

function RackTile(props: {
  tile: Tile;
  size: number;
  selected: boolean;
  interactive: boolean;
  onPress: () => void;
}) {
  const { tile, size } = props;
  const preview = <TileView letter={tile.letter} isBlank={tile.letter === null} size={size} />;
  const { panHandlers, isDragging } = useDraggable(
    { tileId: tile.id, from: 'rack' },
    preview,
    size,
    true, // rearranging the rack is allowed even during the opponents' turns
  );
  return (
    <View {...panHandlers} testID={`rack-tile-${tile.id}`} style={{ marginLeft: GAP }}>
      <Pressable onPress={props.onPress} disabled={!props.interactive} accessibilityRole="button">
        <TileView
          letter={tile.letter}
          isBlank={tile.letter === null}
          size={size}
          selected={props.selected}
          faded={isDragging}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#8b6a3e',
    borderRadius: radius.medium,
    paddingVertical: GAP + 4,
  },
});
