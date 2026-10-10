// 방문 통계(구글 애널리틱스 4). 몇 명이 왔는지, 어디를 거쳐 왔는지, 얼마나 머물렀는지는 구글이 알아서 세고,
// 여기서는 마을 안에서 한 일 몇 가지를 더 보낸다(들어가기, 바로 가기, 처음 가 본 곳, 머문 시간).
// 측정 ID가 비어 있거나 내 컴퓨터(localhost)에서 연 것이면 아무것도 보내지 않는다.
const ID = 'G-CLC1LTQV9K';   // 구글 애널리틱스의 측정 ID(G-로 시작). 비워 두면 통계를 켜지 않는다

let on = false;
export function initStats(local) {
  if (!ID || local) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date()); window.gtag('config', ID);
  const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID; document.head.appendChild(s);
  on = true;
}
// 한 가지 일을 적어 보낸다. name은 영문 소문자와 밑줄(구글의 규칙), params는 덧붙일 값
export function stat(name, params = {}) { if (on) window.gtag('event', name, params); }
// 같은 일은 한 번 들어와 있는 동안 한 번만 보낸다(같은 곳을 드나들 때마다 쌓이지 않게)
const sent = new Set();
export function statOnce(name, params = {}) { const k = name + '|' + JSON.stringify(params); if (sent.has(k)) return; sent.add(k); stat(name, params); }
