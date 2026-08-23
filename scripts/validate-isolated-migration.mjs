import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const ALLOWED_TABLES = new Set([
  "dining_tables",
  "dining_sessions",
  "dining_consumption_batches",
  "dining_session_items",
  "dining_session_item_addons",
  "print_jobs",
  "print_system_state",
]);

function normalizedName(raw) {
  return raw.replaceAll('"', "").split(".").at(-1).toLowerCase();
}

function collectTargets(sql, pattern) {
  return [...sql.matchAll(pattern)].map((match) => normalizedName(match[1]));
}

function splitTopLevelStatements(sql) {
  const statements = [];
  let start = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag = null;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (current === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (singleQuoted) {
      if (current === "'" && next === "'") index += 1;
      else if (current === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (current === '"' && next === '"') index += 1;
      else if (current === '"') doubleQuoted = false;
      continue;
    }
    if (current === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (current === "'") {
      singleQuoted = true;
      continue;
    }
    if (current === '"') {
      doubleQuoted = true;
      continue;
    }
    if (current === "$") {
      const tag = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/)?.[0];
      if (tag) {
        dollarTag = tag;
        index += tag.length - 1;
        continue;
      }
    }
    if (current === ";") {
      statements.push(sql.slice(start, index).trim());
      start = index + 1;
    }
  }
  const trailing = sql.slice(start).trim();
  if (trailing) statements.push(trailing);
  return statements.filter(Boolean);
}

function withoutLeadingComments(statement) {
  return statement.replace(/^(?:\s*--[^\n]*(?:\r?\n|$)|\s*\/\*[\s\S]*?\*\/)+/, "").trim();
}

function allowedTopLevelStatement(statement) {
  const value = withoutLeadingComments(statement);
  return [
    /^begin$/i,
    /^commit$/i,
    /^create\s+table\s+public\.[\w"]+\b/i,
    /^create\s+(?:unique\s+)?index\s+[\w".]+\s+on\s+public\.[\w"]+\b/i,
    /^insert\s+into\s+public\.[\w"]+\b/i,
    /^alter\s+table\s+public\.[\w"]+\b/i,
    /^create\s+policy\s+[\w".]+\s+on\s+public\.[\w"]+\b/i,
    /^create\s+function\s+public\.(?:dining_|print_)[\w"]*\s*\(/i,
    /^(?:grant|revoke)\s+[\s\S]+?\s+on\s+function\s+public\.(?:dining_|print_)[\w"]*\s*\(/i,
    /^(?:grant|revoke)\s+[\s\S]+?\s+on\s+(?:table\s+)?public\.[\w"]+\b/i,
  ].some((pattern) => pattern.test(value));
}

export function validateMigrationSql(sql) {
  const errors = [];
  const forbiddenGlobal = [
    [/\bdrop\s+(?:table|type|function|policy|trigger|index)\b/i, "DROP não é permitido"],
    [/\btruncate\b/i, "TRUNCATE não é permitido"],
    [/\bcreate\s+or\s+replace\s+function\b/i, "CREATE OR REPLACE não é permitido"],
    [/\balter\s+(?:publication|type|function)\b/i, "ALTER global não permitido"],
    [
      /\bcreate\s+(?:type|extension|schema|sequence|view|materialized\s+view|rule)\b/i,
      "Somente tabelas, índices, políticas e funções novas são permitidos",
    ],
    [
      /\b(?:merge\s+into|copy\s+|comment\s+on|security\s+label)\b|\bexecute\s+(?!on\s+function\b)/i,
      "Operação fora da allowlist",
    ],
    [/\bdo\s+\$[^$]*\$/i, "Blocos DO não são permitidos na migração isolada"],
    [/\bon\s+all\s+tables\s+in\s+schema\b/i, "Privilégios globais não são permitidos"],
  ];

  for (const [pattern, message] of forbiddenGlobal) {
    if (pattern.test(sql)) errors.push(message);
  }

  for (const statement of splitTopLevelStatements(sql)) {
    if (!allowedTopLevelStatement(statement)) {
      const summary = withoutLeadingComments(statement).replace(/\s+/g, " ").slice(0, 100);
      errors.push(`Instrução fora da allowlist: ${summary}`);
    }
  }

  const tableTargetPatterns = [
    /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([\w".]+)/gi,
    /\balter\s+table\s+(?:only\s+)?([\w".]+)/gi,
    /\binsert\s+into\s+([\w".]+)/gi,
    /\bupdate\s+([\w".]+)(?:\s+(?:as\s+)?\w+)?\s+set\b/gi,
    /\bdelete\s+from\s+([\w".]+)/gi,
    /\bcreate\s+(?:unique\s+)?index\s+[\w".]+\s+on\s+([\w".]+)/gi,
    /\bcreate\s+policy\s+[\w".]+\s+on\s+([\w".]+)/gi,
    /\balter\s+policy\s+[\w".]+\s+on\s+([\w".]+)/gi,
    /\bcreate\s+(?:constraint\s+)?trigger\s+[\w".]+[\s\S]{0,1000}?\bon\s+([\w".]+)/gi,
    /\b(?:grant|revoke)\s+[\s\S]{1,300}?\bon\s+(?!(?:function|sequence|schema)\b)(?:table\s+)?([\w".]+)/gi,
  ];

  for (const pattern of tableTargetPatterns) {
    for (const table of collectTargets(sql, pattern)) {
      if (!ALLOWED_TABLES.has(table)) {
        errors.push(
          `Escrita, privilégio ou mudança estrutural proibida em tabela existente: ${table}`,
        );
      }
    }
  }

  for (const referencedTable of collectTargets(sql, /\breferences\s+([\w".]+)/gi)) {
    if (!ALLOWED_TABLES.has(referencedTable)) {
      errors.push(
        `FK proibida para tabela existente (criaria trigger interno): ${referencedTable}`,
      );
    }
  }

  const functionTargets = [
    ...collectTargets(sql, /\bcreate\s+function\s+([\w".]+)/gi),
    ...collectTargets(sql, /\b(?:grant|revoke)\s+[\s\S]{1,200}?\bon\s+function\s+([\w".]+)/gi),
  ];
  for (const functionName of functionTargets) {
    if (!functionName.startsWith("dining_") && !functionName.startsWith("print_")) {
      errors.push(`Função fora do namespace isolado: ${functionName}`);
    }
  }

  for (const table of ALLOWED_TABLES) {
    if (!new RegExp(`create\\s+table\\s+public\\.${table}\\b`, "i").test(sql)) {
      errors.push(`Tabela nova obrigatória ausente: ${table}`);
    }
  }

  return [...new Set(errors)];
}

function run() {
  const migrationDirectory = resolve("supabase/migrations");
  const migrationName = readdirSync(migrationDirectory).find((name) =>
    name.endsWith("_dining_tables_and_print_jobs.sql"),
  );
  if (!migrationName) throw new Error("Migração isolada não encontrada.");

  const sql = readFileSync(resolve(migrationDirectory, migrationName), "utf8");
  const errors = validateMigrationSql(sql);
  if (errors.length) {
    console.error(`Validação de isolamento falhou em ${migrationName}:`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Migração isolada validada: ${migrationName}`);
  console.log(`Objetos persistentes permitidos: ${[...ALLOWED_TABLES].join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) run();
