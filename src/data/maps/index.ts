/**
 * The dungeon: an ordered list of level maps. Level links (stairs/pit) refer
 * to levels by their index here (0 = Pillared Hall, 1 = Sunless Crypt).
 */

import type { MapSource } from '../../core/mapParser';
import { level1 } from './level1';
import { level2 } from './level2';
import { level3 } from './level3';
import { level4 } from './level4';
import { level5 } from './level5';
import { town, TOWN_ENTRANCE } from './town';

export const dungeonMaps: MapSource[] = [level1, level2, level3, level4, level5, town];

/** Index of the Town Hub in {@link dungeonMaps} — where Town Portal leads. */
export const TOWN_INDEX = dungeonMaps.length - 1;
export { TOWN_ENTRANCE };
