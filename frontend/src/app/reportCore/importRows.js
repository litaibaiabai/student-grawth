// Normalize spreadsheet cells without coercing invalid numbers to JSON null.
export function normalizeImportRows(rows, fields) {
  return rows.map((row) => {
    const values = {};
    for (const field of fields) {
      const cell = row[field.column];
      if (cell === undefined || cell === null || typeof cell === "string" && !cell.trim()) continue;
      if (["height_cm", "weight_kg", "jump_rope_1min"].includes(field.column)) {
        const number = Number(cell);
        if (!Number.isFinite(number))
          throw Error(`${field.column} 必须填写数字`);
        values[field.column] = number;
      } else if (field.valueType === "star")
        values[field.column] =
          typeof cell === "string" && /^[123]$/.test(cell.trim())
            ? Number(cell)
            : cell;
      else values[field.column] = String(cell).trim();
    }
    return {
      ...(row.studentId
        ? { studentId: String(row.studentId) }
        : { username: String(row.username || "") }),
      values,
    };
  });
}
