# 서드파티 출처

이 폴더의 `geo.js`, `outlier.js`, `animation.js` 는
[mahlernim/google-timeline-visualizer](https://github.com/mahlernim/google-timeline-visualizer)
의 `web/src/geo.ts`, `web/src/outlier.ts`, `web/src/animation.ts` 를 참고해
이 프로젝트에 맞게 옮긴 것입니다.

- 원본 라이선스: **MIT License**
- 원본 저작권: **Copyright (c) 2025 mahlernim**

## 무엇을 가져왔나

| 모듈 | 가져온 것 | 바꾼 것 |
|---|---|---|
| `geo.js` | `haversineKm`, `cumulativeDistances`, 대권 보간 로직 | TypeScript → ES 모듈, 지도 타일 투영(`project`) 계열은 Leaflet 이 대신하므로 제외, `formatDistance`/`speedKmh` 추가 |
| `outlier.js` | "멀리 튀었다가 제자리로 돌아오는 구간" 판정 알고리즘 (`isSuspiciousExcursion`, `suspiciousRunEnd`, `filterLocationOutliers`) | 상수를 항공편 규모(500km 도약, 1300km/h)에서 지상 실시간 추적 규모(1km 도약, 400km/h)로 재조정, GPS `accuracy` 게이트 추가 |
| `animation.js` | `easeOutCubic`, `easeInOutCubic`, `clamp` | 영상 프레임 계산부 대신 `requestAnimationFrame` 트윈 헬퍼 추가 |
| `replay.js` | 진행률을 누적 거리에 매핑하는 방식 (`worldPositionAtDistance`) | 캔버스에 프레임을 그려 MP4 로 인코딩하는 대신, Leaflet 폴리라인/마커를 갱신하는 `requestAnimationFrame` 재생으로 대체 |

## 원본 라이선스 전문

```
MIT License

Copyright (c) 2025 mahlernim

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
