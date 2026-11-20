import { redirect } from "next/navigation";

// Design Ref: §2.1 — 시작 화면(/)은 가격표 화면(/tags)으로 바로 이동한다.
// Plan SC: 작업 1번 (앱 기본 틀과 메뉴)
export default function Home() {
  redirect("/tags");
}
