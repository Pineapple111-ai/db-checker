export function passwordProblem(p: string): string | null {
  if (p.length < 10) return "비밀번호는 10자 이상이어야 합니다.";
  if (p.length > 72) return "비밀번호는 72자 이하여야 합니다.";
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9]/.test(p)) {
    return "비밀번호는 대문자·소문자·숫자·특수문자를 모두 포함해야 합니다.";
  }
  return null;
}