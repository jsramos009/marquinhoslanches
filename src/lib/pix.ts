// Gera o payload BR Code (EMV) do PIX estático e o CRC16-CCITT.

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitize(input: string, max: number): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, max);
}

export type PixPayloadInput = {
  key: string;
  amount: number;
  merchantName: string;
  merchantCity: string;
  txid?: string;
};

export function buildPixPayload({
  key,
  amount,
  merchantName,
  merchantCity,
  txid,
}: PixPayloadInput): string {
  const gui = tlv("00", "br.gov.bcb.pix");
  const pixKey = tlv("01", key.trim());
  const merchantAccount = tlv("26", gui + pixKey);

  const name = sanitize(merchantName, 25) || "RECEBEDOR";
  const city = sanitize(merchantCity, 15) || "CIDADE";
  const cleanTxid = sanitize(txid ?? "***", 25) || "***";

  const additional = tlv("62", tlv("05", cleanTxid));

  const amountStr = amount.toFixed(2);

  const partial =
    tlv("00", "01") +
    tlv("01", "12") +
    merchantAccount +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", amountStr) +
    tlv("58", "BR") +
    tlv("59", name) +
    tlv("60", city) +
    additional +
    "6304";

  return partial + crc16(partial);
}