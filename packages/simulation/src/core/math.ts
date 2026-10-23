/**
 * Toán học tất định cho domain (ADR-02).
 * Mọi giá trị là safe integer; chỉ dùng + − × ÷ rồi làm tròn xuống, kết quả giống nhau trên mọi engine
 * vì phép toán IEEE 754 cơ bản trên số nguyên < 2^53 là chính xác hoặc làm tròn đúng chuẩn.
 */

/** 100% theo basis point. */
export const BP_ONE = 10_000;
/** 1.0 theo fixed-point ×1000. */
export const FX_ONE = 1_000;

export class DeterminismError extends Error {
  override name = 'DeterminismError';
}

export function assertSafeInt(value: number, label = 'value'): number {
  if (!Number.isSafeInteger(value)) {
    throw new DeterminismError(`${label} phải là safe integer, nhận ${value}`);
  }
  return value;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** floor(a / b) với b > 0, đúng cả khi a âm. */
export function divFloor(a: number, b: number): number {
  assertSafeInt(a, 'a');
  assertSafeInt(b, 'b');
  if (b <= 0) throw new DeterminismError(`Mẫu số phải > 0, nhận ${b}`);
  return Math.floor(a / b);
}

/** ceil(a / b) với b > 0. */
export function divCeil(a: number, b: number): number {
  return -divFloor(-a, b);
}

/** floor(a × b / c); tích a × b phải là safe integer. */
export function mulDiv(a: number, b: number, c: number): number {
  const product = a * b;
  assertSafeInt(product, 'a×b');
  return divFloor(product, c);
}

/** Nhân x với hệ số basis point, làm tròn xuống: floor(x × bp / 10000). */
export function mulBp(x: number, bp: number): number {
  return mulDiv(x, bp, BP_ONE);
}

/** Bảng tra: các điểm [x, y] sắp tăng dần theo x. */
export type CurveTable = readonly (readonly [number, number])[];

/**
 * Nội suy tuyến tính từng đoạn, làm tròn xuống; ngoài biên thì kẹp giá trị đầu/cuối.
 * Dùng thay cho hàm mũ/log trong công thức cân bằng.
 */
export function lerpTable(table: CurveTable, x: number): number {
  assertSafeInt(x, 'x');
  const first = table[0];
  const last = table[table.length - 1];
  if (!first || !last) throw new DeterminismError('Bảng tra rỗng');
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!;
    const [x0, y0] = table[i - 1]!;
    if (x0 >= x1) throw new DeterminismError('Bảng tra phải tăng nghiêm ngặt theo x');
    if (x <= x1) return y0 + mulDiv(y1 - y0, x - x0, x1 - x0);
  }
  return last[1];
}
