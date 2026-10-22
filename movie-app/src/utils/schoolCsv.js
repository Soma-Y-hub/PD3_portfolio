const NAME_HEADERS = new Set(["name", "username", "user name", "名前", "ユーザー名"]);

export function parseSchoolCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const input = String(text).replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(field.trim());
      field = "";
      if (char !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === "\r" && input[index + 1] === "\n") index += 1;
      }
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSVの引用符が閉じられていません。");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length === 0) throw new Error("CSVにユーザー名がありません。");

  const firstValue = rows[0][0]?.trim().toLocaleLowerCase();
  const hasHeader = rows[0].length === 1 && NAME_HEADERS.has(firstValue);
  const names = (hasHeader ? rows.slice(1) : rows).map((values, index) => {
    if (values.length !== 1) {
      throw new Error(`CSVの${index + (hasHeader ? 2 : 1)}行目はユーザー名1列だけにしてください。`);
    }
    const name = values[0].trim();
    if (!name || name.length > 100) {
      throw new Error(`CSVの${index + (hasHeader ? 2 : 1)}行目の名前を確認してください（1〜100文字）。`);
    }
    return { name, role: "student", color: "#fff176" };
  });

  if (names.length === 0) throw new Error("CSVにユーザー名がありません。");
  return names;
}
