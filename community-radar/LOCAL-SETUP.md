# Claude Code를 본인 PC에서 돌리기 (전체 파이프라인 로컬 실행)

클라우드 환경은 네트워크 정책 때문에 커뮤니티 사이트 접속이 막혀 있지만, **본인 PC에서 Claude Code를 실행하면 제한이 없어서** 이 리포의 에이전트 팀(발굴→수집→각색→검수→보고)이 그대로 전부 돌아갑니다.

## 설치 (Windows 기준, 한 번만)

1. **Claude Code 데스크톱 앱 설치**: https://claude.ai/code 에서 다운로드 (또는 터미널에서 `npm install -g @anthropic-ai/claude-code`)
2. **이 리포 내려받기**: GitHub에서 Code → Download ZIP 받아 풀거나, git이 있으면
   ```
   git clone https://github.com/leedopo2001-crypto/-.git community-radar-repo
   ```
3. Claude Code 앱에서 그 폴더를 열기

## 사용

채팅창에 입력:

```
/daily-community-report
```

이거 하나로 스카우트 5명이 사이트별로 인기글을 발굴하고, 선별→캡쳐/다운로드→렉카체·커뮤체 각색→검수를 거쳐 `community-radar/output/오늘날짜/report.md` 보고서가 나옵니다.

## 참고

- 로컬 실행이므로 에펨코리아 등의 안티봇에는 똑같이 걸릴 수 있습니다. 스카우트가 알아서 검색 폴백으로 전환합니다.
- 결과물을 클라우드 세션과 공유하려면 커밋·푸시하면 됩니다 (팀장 프로토콜에 포함됨).
- 수집만 가볍게 하고 싶은 날은 `local-collector/`의 수집기(start.bat)를 쓰는 것도 방법.
