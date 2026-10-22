# 5분 검토 동선

설치 시간은 빼고 잡은 동선입니다. 먼저 [README의 실행 절차](../README.md#실행)대로 앱을 켜세요.

| 시간 | 해 볼 일 | 볼 코드 |
| --- | --- | --- |
| 1분 | `/jobs`에서 직무 필터를 바꾸고 공고 하나 열기 | [`app/jobs/page.tsx`](../app/jobs/page.tsx), [`repository.ts`](../lib/repository.ts) |
| 2분 | 공고의 회사로 넘어가 회사 설명과 읽을거리 둘러보기 | [`app/companies/[id]/page.tsx`](../app/companies/[id]/page.tsx), [`question-view.ts`](../lib/question-view.ts) |
| 3분 | 공고를 저장하고 `/saved`에서 확인하기 | [`components/bookmark.tsx`](../components/bookmark.tsx), [`lib/bookmarks.ts`](../lib/bookmarks.ts) |
| 4분 | 늦게 끝나는 읽기를 다룬 경쟁 상태 테스트 읽기 | [`revision-cache.test.ts`](../tests/revision-cache.test.ts), [`revision-cache.ts`](../lib/revision-cache.ts) |
| 5분 | JEV 판정의 0.75 경계와 보류 테스트 읽기 | [`jev-shadow.test.ts`](../tests/jev-shadow.test.ts), [`jev-shadow.ts`](../lib/jev-shadow.ts) |

회사와 공고는 가상이고 외부 근거 주소도 데모용입니다. 날짜가 2026-10-22에 고정되어 있어서, 나중에 실행하면 "며칠 전" 같은 경과 시간 표시는 달라질 수 있습니다.

## 검증 명령이 확인하는 것

| 명령 | 확인하는 것 |
| --- | --- |
| `pnpm typecheck` | 공개판 소스의 TypeScript 타입 |
| `pnpm test` | 포함된 단위 테스트와 규칙 회귀 테스트 |
| `pnpm test:sensitivity` | 격리한 복사본에 결함 13가지를 넣고 테스트가 잡아내는지 |
| `pnpm build` | 공개판의 운영용 빌드 |
| `pnpm test:http` | 운영용 빌드 서버의 HTTP 응답, 요청과 자료의 경계 |
| `pnpm verify:source` | SOURCE_MANIFEST.json에 적힌 해시와 지금 파일이 맞는지 |

HTTP 검사 전에는 `pnpm build`를 먼저 실행하세요. 자료를 바꿔 보는 검사는 임시 복사본에서 하고 저장소의 가상 자료는 건드리지 않습니다. 개발 서버를 미리 켜 둘 필요는 없습니다.

가상 데이터를 고쳤다면 `pnpm demo:reset`으로 [`scripts/demo-data.ts`](../scripts/demo-data.ts)의 고정 스냅샷을 다시 만들 수 있습니다.

이 검증은 공개판에 들어 있는 범위만 다룹니다. 운영 수집과 발행 전체의 회귀 테스트, 실제 API나 모델의 평가 결과는 들어 있지 않습니다. 테스트가 통과했다고 해서 운영 서비스의 정확도나 지연, 가용성을 보증하지는 않습니다.

어떤 테스트를 남기고 보강했는지, 결함을 어디까지 넣어 보는지는 [테스트 전략](testing.md)에 적었습니다.

## 더 읽는다면

- 프론트엔드 관점: [`render-data.ts`](../lib/render-data.ts)에서 [`repository.ts`](../lib/repository.ts)를 거쳐 [`app/api/jobs/route.ts`](../app/api/jobs/route.ts)까지 읽어 보세요. 캐시 수명과 요청별 조건이 만나는 곳입니다.
- 제품 모델 관점: [`research-questions.ts`](../lib/research-questions.ts), [`question-assessment.ts`](../lib/question-assessment.ts), [`question-view.ts`](../lib/question-view.ts) 순서로 읽어 보세요. 자료를 가지고 있는 것과 질문에 충분히 답한 것을 어떻게 나누는지 보입니다.
- 구조 관점: [전체 구조 그림](architecture.md#운영-전체-구조)에서 운영 전체 중 이 저장소가 맡은 범위와 다섯 가지 판단의 위치를 먼저 보세요.
- 신뢰성 관점: [설계 결정](design-decisions.md)에서 캐시 경쟁 상태, 계측의 양성 대조, 평가의 권한 제한을 각각 어떤 실패와 연결했는지 볼 수 있습니다.

출처를 비교하려면 [SOURCE_MANIFEST.json](../SOURCE_MANIFEST.json)부터 보세요. 파일마다 원본과 바이트가 같은지(`exact`), 공개판에 맞게 바꿨는지(`adapter`), 새로 만들었는지(`generated`)가 적혀 있습니다.
