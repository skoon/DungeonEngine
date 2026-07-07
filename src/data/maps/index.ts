/**
 * The dungeon: an ordered list of level maps. Level links (stairs/pit) refer
 * to levels by their index here (0 = Pillared Hall, 1 = Sunless Crypt).
 */

import type { MapSource } from '../../core/mapParser';
import { level1 } from './level1';
import { level2 } from './level2';

export const dungeonMaps: MapSource[] = [level1, level2];
