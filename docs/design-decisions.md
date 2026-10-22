# 코드로 확인하는 설계 결정 3가지

각 사례는 사용자에게 보이는 문제, 선택한 경계, 이를 확인하는 테스트 순서로 읽을 수 있습니다. 결정 1·2는 [전체 구조](architecture.md#운영-전체-구조)의 ④, 결정 3은 ②에 해당하며, 이 저장소의 테스트로 직접 확인할 수 있습니다.

## 1. 공개 데이터는 공유하고, 사용자 조건은 요청에서 조합한다

두 구직자가 동시에 프론트엔드와 백엔드 공고를 보면 자료는 같아도 목록은 달라야 합니다. 매번 모든 파일을 읽으면 중복 작업이 생기고, 개인별 결과를 공유 캐시에 넣으면 다른 요청으로 조건이 섞일 수 있습니다.

[`published-data.ts`](../lib/published-data.ts)는 불변의 공개 자료를 revision별로 재사용합니다. [`render-data.ts`](../lib/render-data.ts)는 렌더 안의 중복 읽기를 묶고, [`preference-store.ts`](../lib/preference-store.ts)는 요청 쿠키를 따로 읽습니다. [`repository.ts`](../lib/repository.ts)에서 공개 자료와 사용자 조건을 합칩니다.

TTL 동안 이전 자료를 계속 제공하는 방식 대신 호출 때 파일 상태를 확인합니다. 따라서 warm 요청에도 `stat` 비용은 남습니다. 연구 자료의 revision에는 관계 파일과 UTC 날짜도 포함되어 관계 정정과 날짜 변화가 읽기 결과에 반영됩니다.

[`ssr-reads-http.test.mjs`](../tests/ssr-reads-http.test.mjs)에서 검토할 동작은 동시 frontend/backend 요청의 조건 분리, 명시적인 빈 필터의 선호 덮어쓰기, 파일 갱신 뒤 응답의 변화입니다. React `cache`의 요청 경계는 실제 production RSC 서버에서 확인해야 합니다. 일반 단위 테스트에서 함수만 호출한 결과로 대신하지 않습니다.

## 2. 읽기 순서가 뒤집혀도 새 revision을 유지한다

공고 제목이 갱신된 뒤에도 느린 이전 요청이 옛 제목을 돌려주는 상황을 막아야 합니다. revision A의 파일 읽기가 늦어지는 동안 B가 먼저 끝날 수 있습니다. A의 완료 시점에 캐시를 다시 설치하거나 현재 캐시를 무조건 제거하면 더 최신인 B를 잃을 수 있습니다.

[`revision-cache.ts`](../lib/revision-cache.ts)는 읽기 전후와 결과 반환 직전에 revision을 확인합니다. 실패한 항목을 제거할 때는 `entry === current`를 검사해 다른 요청이 설치한 항목을 보존합니다. 계속 자료가 바뀌면 최대 3회 시도 후 오류를 반환합니다.

[`revision-cache.test.ts`](../tests/revision-cache.test.ts)의 경쟁 상태 테스트는 A를 멈추고 B를 완료한 다음 A를 해제합니다. 두 요청이 모두 B를 반환하고 추가 파일 읽기가 발생하지 않는지 확인합니다. 같은 크기·복원된 mtime의 수정, 파일 삭제와 복구, 실패한 Promise의 재사용 방지도 같은 파일에서 확인할 수 있습니다.

SSR의 warm 파일 읽기 0회라는 결과에는 별도 조건이 필요합니다. 계측기가 동작하지 않아도 0이 나올 수 있기 때문입니다. [`ssr-measure.mjs`](../tests/helpers/ssr-measure.mjs)는 시작 시 실제 파일 `open`을 관측하는 **양성 대조**를 먼저 요구합니다. [`instrumentation.test.mjs`](../tests/instrumentation.test.mjs)는 빈 계측 결과가 이 단계에서 실패하는지 확인합니다. 그 뒤 대표 경로의 warm 요청에서 전체 파일 읽기 호출을 셉니다. 이는 파일 읽기 회귀 검사이며 요청 지연이나 운영 p95 측정이 아닙니다.

## 3. 모델의 판단과 발행 권한을 분리한다

가입자가 5명 줄었다는 관측만으로 직원 5명이 퇴사했다고 설명하면 구직자의 판단을 오도할 수 있습니다. 저장 발췌를 평가할 때는 숫자 일치뿐 아니라 범위와 인과의 확장도 확인해야 합니다.

[`jev-shadow.ts`](../lib/jev-shadow.ts)는 support·scope·causality를 각각 평가하도록 계약을 정의합니다. 모델 ID, 응답 형태, 확률합, 선택값과 최대 확률의 일치, confidence 관계를 검사합니다. 모든 차원이 충분한 confidence로 `supported`일 때만 `pass`, 하나라도 충분한 confidence로 `unsupported`이면 `flag`, 나머지는 `abstain`입니다. 형식 오류는 유효한 판정이 아닙니다.

기준 `0.75`는 `choice.confidence`에 적용됩니다. 선택 확률 0.75나 정확도 75%를 뜻하지 않습니다. 반올림된 응답이 임계값을 넘지 않도록 확률에서 confidence를 재계산해 함께 확인합니다. [`jev-shadow.test.ts`](../tests/jev-shadow.test.ts)에서 0.75 경계, 0.749 보류, 불확실성, 잘못된 응답, 반올림을 검증합니다.

계약의 집계 결과는 `publicationAuthority: false`와 `modelAccuracyClaim: 'not_established'`를 명시합니다. `pass`도 조사 완료·사실성 보증·발행 승인이 아닙니다. 공개판은 합성 입력과 응답으로 이 계약을 검증하며 실제 모델 호출의 의미 품질은 측정하지 않습니다. [계약 상세](jev-shadow-evaluation.md)
