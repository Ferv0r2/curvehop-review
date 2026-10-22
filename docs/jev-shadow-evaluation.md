# JEV 순수 판정 계약

원본은 [`lib/jev-shadow.ts`](../lib/jev-shadow.ts)입니다. 공개판에서는 합성 사례와 모의 응답으로 계약을 검증합니다. API 키와 실제 모델 호출은 필요하지 않습니다.

| 항목 | 계약 |
| --- | --- |
| 모델 | `jev-1.13.0`으로 고정된 응답 검증 |
| 입력 | 주장, 한계, 법인·지역·직무·공고·시점 범위, 저장 발췌 |
| 차원 | `evidence.support`, `evidence.scope`, `evidence.causality` |
| 선택지 | `supported`, `unsupported`, `insufficient` |
| 판정 | `pass`, `flag`, `abstain`; 잘못된 응답은 오류 |
| 임계값 | `choice.confidence >= 0.75` |
| 권한 | `publicationAuthority: false` |

confidence는 3개 선택지의 최대 확률을 사용한 `(3 × maxProbability − 1) / 2` 관계로 검증합니다. 판정에는 보고된 confidence와 재계산한 값 중 작은 값을 사용합니다. 따라서 최대 선택 확률 0.75는 confidence 0.625이며 통과 기준에 못 미칩니다.

모든 차원이 임계값 이상으로 `supported`이면 `pass`입니다. 하나라도 임계값 이상으로 `unsupported`이면 `flag`이며, 나머지는 `abstain`입니다. 높은 confidence의 `insufficient`도 보류입니다. 모델 불일치·누락된 차원·잘못된 확률합·선택값 불일치 등은 오류로 거절합니다.

fixture의 정답 라벨과 기존 평가 결과는 모델 입력에 전달하지 않습니다. 질문 계약과 의미 입력을 해시에 묶고, 정답 라벨이 없는 사례를 정확도 근거로 계산하지 않습니다. 집계는 보류와 오류를 별도로 남깁니다.

검토할 파일은 [`tests/jev-shadow.test.ts`](../tests/jev-shadow.test.ts)입니다. [`lib/jev-shadow-run.ts`](../lib/jev-shadow-run.ts)와 [`lib/jev-client.ts`](../lib/jev-client.ts)는 평가 실행과 전송 경계를 보여 주며, 공개판의 테스트는 모의 전송을 사용합니다. 실제 호출용 CLI와 정기 실행은 포함하지 않습니다. 이 테스트가 입증하는 것은 코드의 경계 처리이며, 실제 모델의 한국어 의미 판단 성능이나 발행 적합성이 아닙니다.
