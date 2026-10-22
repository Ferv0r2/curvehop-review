# 5분 검토 동선

설치 시간은 제외한 동선입니다. 먼저 [README의 실행 절차](../README.md#실행)로 앱을 켜세요.

| 시간 | 해볼 일 | 볼 코드 |
| --- | --- | --- |
| 0–1분 | `/jobs`에서 직무 필터를 바꾸고 공고를 열기 | [`app/jobs/page.tsx`](../app/jobs/page.tsx), [`repository.ts`](../lib/repository.ts) |
| 1–2분 | 공고의 회사로 이동해 회사 설명과 읽을거리 탐색하기 | [`app/companies/[id]/page.tsx`](../app/companies/[id]/page.tsx), [`question-view.ts`](../lib/question-view.ts) |
| 2–3분 | 공고를 저장하고 `/saved`에서 확인하기 | [`components/bookmark.tsx`](../components/bookmark.tsx), [`lib/bookmarks.ts`](../lib/bookmarks.ts) |
| 3–4분 | 늦게 끝나는 읽기의 경쟁 상태 테스트 읽기 | [`revision-cache.test.ts`](../tests/revision-cache.test.ts), [`revision-cache.ts`](../lib/revision-cache.ts) |
| 4–5분 | JEV의 0.75 경계와 보류 테스트 읽기 | [`jev-shadow.test.ts`](../tests/jev-shadow.test.ts), [`jev-shadow.ts`](../lib/jev-shadow.ts) |

회사와 공고는 가상이며 외부 근거 주소도 데모용입니다. 날짜는 2026-10-22에 고정되어 있어 이후 실행할 때 경과 시간 표시는 달라질 수 있습니다.

## 검증 명령이 확인하는 것

| 명령 | 목적 |
| --- | --- |
| `pnpm typecheck` | 공개판 소스의 TypeScript 정합성 |
| `pnpm test` | 포함된 단위·계약 회귀 테스트 |
| `pnpm test:sensitivity` | 격리 복사본에 13가지 결함을 넣어 테스트가 잡는지 검사 |
| `pnpm build` | 공개판의 production build |
| `pnpm test:http` | production 서버에서 HTTP 응답과 요청·데이터 경계 검사 |
| `pnpm verify:source` | manifest에 기록된 해시와 공개 파일의 무결성 확인 |

HTTP 검사 전에 `pnpm build`를 실행합니다. 데이터 변경 검사는 임시 런타임에서 수행하며 저장소의 가상 자료를 직접 수정하지 않습니다. 개발 서버를 직접 켜 두는 것은 HTTP 검사의 선행조건이 아닙니다.

가상 데이터를 편집했다면 `pnpm demo:reset`으로 [`scripts/demo-data.ts`](../scripts/demo-data.ts)의 고정 스냅샷을 다시 생성할 수 있습니다.

이 검증은 공개판에 포함된 범위만 다룹니다. 생산 수집·발행 전체 회귀 테스트나 실제 API·모델의 평가 결과를 포함하지 않습니다. 테스트가 통과해도 운영 서비스의 정확도·지연·가용성 수치가 되지는 않습니다.

테스트를 유지하거나 보강한 기준과 결함 주입 범위는 [테스트 전략](testing.md)에 기록했습니다.

## 더 읽는다면

- FE 관점: [`render-data.ts`](../lib/render-data.ts) → [`repository.ts`](../lib/repository.ts) → [`app/api/jobs/route.ts`](../app/api/jobs/route.ts). 캐시 수명과 요청별 조건이 만나는 위치를 보세요.
- 제품 모델 관점: [`research-questions.ts`](../lib/research-questions.ts) → [`question-assessment.ts`](../lib/question-assessment.ts) → [`question-view.ts`](../lib/question-view.ts). 자료 보유와 답변 충분성이 어떻게 구분되는지 보세요.
- 신뢰성 관점: [설계 결정](design-decisions.md). 캐시 경쟁 상태, 계측 양성 대조, 평가의 권한 제한을 각각 실패 조건과 연결했습니다.

출처 비교는 [SOURCE_MANIFEST.json](../SOURCE_MANIFEST.json)에서 시작합니다. `exact`는 원본과 바이트가 같은 파일, `adapter`는 공개판에 맞게 변경한 파일, `generated`는 새로 만든 파일입니다.
