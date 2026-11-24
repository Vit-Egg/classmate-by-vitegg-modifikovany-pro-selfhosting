/** Kontrola síly hesla: délka a ochrana proti nejčastějším heslům, která se hádají jako první. */
const COMMON = new Set(
  `12345678 123456789 1234567890 11111111 00000000 87654321 12341234 123123123 12345679 1q2w3e4r 1q2w3e4r5t 1qaz2wsx qwertyuiop qwerty123 qwertyui qwertz123 asdfghjk asdfghjkl zxcvbnm1 password password1 password123 passw0rd p4ssw0rd heslo123 heslo1234 mojeheslo heslo1234 admin123 administrator letmein1 welcome1 iloveyou abc12345 abcd1234 abcdefgh trustno1 monkey123 dragon123 football1 baseball1 master123 sunshine1 princess1 skola123 skolaskola student1 student123 bakalari bakalari1 bakalari123 classmate classmate1 classmate123 pokemon1 minecraft1 fortnite1 brouk123 ahoj1234 ahojahoj cau12345 cesko123 praha123 brno1234`.split(/\s+/),
);

/** Vrátí text chyby, nebo null, když je heslo v pořádku. */
export function passwordProblem(password: string, ...personal: (string | null | undefined)[]): string | null {
  if (password.length < 8) return "Heslo musí mít aspoň 8 znaků.";
  if (password.length > 200) return "Heslo je moc dlouhé.";
  const low = password.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(password)) return "Tohle heslo je moc časté, vymysli jiné.";
  if (new Set(password).size < 4) return "Heslo je moc jednoduché, použij víc různých znaků.";
  for (const p of personal) {
    const bit = (p ?? "").toLowerCase().split("@")[0];
    if (bit.length >= 4 && (low === bit || low.includes(bit) && bit.length >= password.length - 2)) return "Heslo nesmí být tvoje jméno ani e-mail.";
  }
  return null;
}
