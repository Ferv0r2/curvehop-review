# JEV 판정 규칙

JEV는 저장한 발췌가 회사에 관한 설명을 실제로 뒷받침하는지 판정하는 외부 평가 모델입니다. 판정 규칙의 원본은 [`lib/jev-shadow.ts`](../lib/jev-shadow.ts)입니다. 공개판에서는 미리 만든 사례와 가짜 응답으로 이 규칙을 검사하므로 API 키도 실제 모델 호출도 필요 없습니다.

| 항목 | 규칙 |
| --- | --- |
| 모델 | `jev-1.13.0`으로 고정한 응답만 받음 |
| 입력 | 주장, 한계, 범위(법인, 지역, 직무, 공고, 시점), 저장한 발췌 |
| 판정 항목 | `evidence.support`(근거), `evidence.scope`(범위), `evidence.causality`(인과) |
| 선택지 | `supported`, `unsupported`, `insufficient` |
| 판정 | `pass`, `flag`, `abstain`. 형식이 틀린 응답은 오류 |
| 기준값 | `choice.confidence >= 0.75` |
| 권한 | `publicationAuthority: false` |

신뢰도(`confidence`)는 선택지 3개 중 가장 높은 확률로 `(3 × maxProbability − 1) / 2`를 계산해 맞는지 검사합니다. 판정에는 응답에 적힌 신뢰도와 다시 계산한 값 중 작은 쪽을 씁니다. 그래서 가장 높은 선택 확률이 0.75이면 신뢰도는 0.625이고 기준에 못 미칩니다.

세 항목이 모두 기준 이상으로 `supported`이면 `pass`입니다. 하나라도 기준 이상으로 `unsupported`이면 `flag`이고, 나머지는 `abstain`(보류)입니다. 신뢰도가 높아도 `insufficient`는 보류입니다. 모델이 다르거나, 항목이 빠졌거나, 확률의 합이 맞지 않거나, 고른 값이 확률과 어긋나는 응답은 오류로 거절합니다.

테스트 사례의 정답 라벨과 기존 평가 결과는 모델 입력에 넣지 않습니다. 질문 정의와 의미 입력을 해시로 묶고, 정답 라벨이 없는 사례는 정확도 근거로 세지 않습니다. 집계에는 보류와 오류를 따로 남깁니다.

검토할 파일은 [`tests/jev-shadow.test.ts`](../tests/jev-shadow.test.ts)입니다. [`lib/jev-shadow-run.ts`](../lib/jev-shadow-run.ts)와 [`lib/jev-client.ts`](../lib/jev-client.ts)는 평가를 실행하고 요청을 보내는 경계를 보여 주고, 공개판의 테스트는 가짜 전송을 씁니다. 실제로 호출하는 명령과 정기 실행은 들어 있지 않습니다. 이 테스트가 보여 주는 것은 코드가 경계값을 제대로 처리한다는 점이고, 실제 모델의 한국어 의미 판단 성능이나 발행해도 되는지는 아닙니다.
