// Design Ref: §5.2 — 로그인 뒤에 돌아갈 주소(next)가 우리 앱 안의 주소인지 확인한다.
// 남의 사이트로 보내는 주소(//evil.com 등)나 로그인 화면 자신은 받지 않는다.
// 브라우저 화면 코드와 서버 코드 모두에서 쓸 수 있다 (node 전용 기능을 쓰지 않음).

export function isSafeNextPath(path: string | null): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false; // 앱 안의 주소만
  if (path.startsWith("//") || path.startsWith("/\\")) return false; // 다른 사이트 주소로 해석될 수 있음
  if (path === "/login" || path.startsWith("/login?") || path.startsWith("/login/")) return false;
  return true;
}
