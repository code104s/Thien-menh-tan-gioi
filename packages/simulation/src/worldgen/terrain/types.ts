/**
 * Kiểu dữ liệu địa hình (ADR-16, docs/08 › TerrainModel). Không thuộc WorldState, không vào snapshot:
 * sinh lại được từ (seed, TERRAIN_GEN_VERSION, game-data).
 */

/** Tăng khi đổi BẤT KỲ thuật toán hoặc tham số địa hình nào (code hoặc game-data). */
export const TERRAIN_GEN_VERSION = 1;

export interface TerrainModel {
  terrainGenVersion: number;
  /** Hex odd-r; ô i ↔ (x = i % width, y = floor(i / width)). */
  width: number;
  height: number;
  /** ≤ seaLevel = biển; > seaLevel = đất (đã lấp trũng). */
  elevation: Int16Array;
  /** 0..1000 */
  moisture: Uint16Array;
  /** Chỉ số vào gameData.biomes. */
  biome: Uint8Array;
  /** Ô hạ lưu sau priority-flood; −1 = biển / cửa sông / rìa lưới. */
  downstream: Int32Array;
  /** Lưu lượng cộng dồn, bão hòa ở 65535. */
  flow: Uint16Array;
  /** Địa khí; −1 = biển. */
  qi: Int16Array;
  /** Chỉ số địa điểm (0..locationCount−1, theo thứ tự id) hoặc −1 (biển, đảo ngoài khối đất chính). */
  cellLocation: Int16Array;
  /** FNV-1a 64 (ADR-11) trên kích thước và mọi mảng trên. */
  digest: string;
}

/** Cạnh giữa hai địa điểm (chỉ số site), suy ra từ hai vùng kề nhau. */
export interface SiteEdge {
  a: number;
  b: number;
  /** Chi phí đường tốt nhất qua biên hai vùng (tổng travelCost các ô, không tính ô neo). */
  cost: number;
  travelDays: number;
}

/** Kết quả worldgen địa hình: model cho UI + phần suy ra cho WorldState. */
export interface TerrainWorld {
  model: TerrainModel;
  /** Ô neo (anchorCell) của địa điểm thứ k, tăng dần theo chỉ số ô. */
  sites: number[];
  /** Đồ thị địa điểm: MST + extraEdges, sắp theo (a, b). */
  edges: SiteEdge[];
}
