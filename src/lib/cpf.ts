export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function digitoVerificador(digits: string, peso: number): number {
  let soma = 0;
  for (const c of digits) {
    soma += Number(c) * peso;
    peso--;
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/** Valida CPF pelos dígitos verificadores (algoritmo padrão da Receita Federal). */
export function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const d1 = digitoVerificador(digits.slice(0, 9), 10);
  if (d1 !== Number(digits[9])) return false;

  const d2 = digitoVerificador(digits.slice(0, 10), 11);
  if (d2 !== Number(digits[10])) return false;

  return true;
}

export function soDigitosCpf(value: string): string {
  return value.replace(/\D/g, "");
}
