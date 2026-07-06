export const meta = {
  name: 'daily-community-radar',
  description: '국내 커뮤니티 인기/논쟁 글을 발굴 → 수집 → 각색 → 검수하는 데일리 파이프라인',
  whenToUse: '데일리 커뮤니티 콘텐츠 리포트를 생성할 때. args로 {date: "YYYY-MM-DD"} 필수, {perSite, finalCount} 선택.',
  phases: [
    { title: '발굴', detail: '커뮤니티별 스카우트 병렬 투입' },
    { title: '선별', detail: '전체 후보 중복 제거 및 크로스 랭킹' },
    { title: '수집', detail: '선정 글 캡쳐·텍스트·댓글 저장' },
    { title: '각색', detail: '렉카체·커뮤체 초안 작성' },
    { title: '검수', detail: '법적 리스크·품질 판정' },
  ],
}

const date = args && args.date
if (!date) throw new Error('args.date ("YYYY-MM-DD")가 필요합니다')
const perSite = (args && args.perSite) || 6
const finalCount = (args && args.finalCount) || 8
const outDir = `community-radar/output/${date}`

const SITES = [
  { key: 'fmkorea', name: '에펨코리아', note: '포텐 터짐 게시판 중심. 안티봇 강함 — 차단 시 검색 폴백' },
  { key: 'ruliweb', name: '루리웹', note: '베스트(유머 BEST) 게시판 중심' },
  { key: 'dcinside', name: '디시인사이드', note: '실시간 베스트(dcbest) 중심' },
  { key: 'bboom', name: '네이버 뿜', note: '서비스 종료 가능성 있음 — 접속 불가면 failed로 보고하고 대체 소스(네이트판 톡커들의선택 등)를 제안만' },
  { key: 'blind', name: '블라인드', note: '로그인 필수 서비스 — 공개 웹 미리보기와 검색 폴백만 사용, 로그인 우회 금지' },
]

const CANDIDATES_SCHEMA = {
  type: 'object',
  required: ['site', 'access', 'posts'],
  properties: {
    site: { type: 'string' },
    access: { type: 'string', enum: ['direct', 'search', 'failed'] },
    fail_reason: { type: 'string' },
    posts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'url', 'category', 'hook', 'summary'],
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          posted_at: { type: ['string', 'null'] },
          views: { type: ['integer', 'null'] },
          comment_count: { type: ['integer', 'null'] },
          category: { type: 'string', enum: ['인기글', 'vs논쟁', '댓글유발'] },
          hook: { type: 'string' },
          summary: { type: 'string' },
        },
      },
    },
  },
}

const SELECTION_SCHEMA = {
  type: 'object',
  required: ['selected'],
  properties: {
    selected: {
      type: 'array',
      items: {
        type: 'object',
        required: ['site', 'title', 'url', 'category', 'reason', 'slug'],
        properties: {
          site: { type: 'string' },
          title: { type: 'string' },
          url: { type: 'string' },
          category: { type: 'string' },
          reason: { type: 'string' },
          slug: { type: 'string', description: '번호-영문슬러그 형식, 예: 01-mbti-vs' },
        },
      },
    },
  },
}

const COLLECT_SCHEMA = {
  type: 'object',
  required: ['status', 'dir'],
  properties: {
    status: { type: 'string', enum: ['ok', 'partial', 'failed', 'skipped_nsfw'] },
    dir: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    top_comments: { type: 'array', items: { type: 'string' } },
    fail_reason: { type: 'string' },
  },
}

const DRAFT_SCHEMA = {
  type: 'object',
  required: ['draft_path', 'titles'],
  properties: {
    draft_path: { type: 'string' },
    titles: { type: 'array', items: { type: 'string' } },
    hook: { type: 'string' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'pass_with_edits', 'fail'] },
    risk_flags: { type: 'array', items: { type: 'string' } },
    edit_requests: { type: 'array', items: { type: 'string' } },
    best_title: { type: 'string' },
    note: { type: 'string' },
  },
}

// ── 1단계: 발굴 — 사이트별 스카우트 병렬 투입
phase('발굴')
const scouted = await parallel(SITES.map(s => () =>
  agent(
    `담당 커뮤니티: ${s.name} (${s.key})\n참고: ${s.note}\n` +
    `오늘(${date}) 기준 인기글·vs논쟁글·댓글유발형 글을 최대 ${perSite}건 발굴하세요. ` +
    `community-radar/config/sources.yaml에서 보드 URL을 확인하고 에이전트 정의의 접근 전략을 따르세요. ` +
    `실제 확인한 글만 보고하고, 접근 실패 시 posts는 빈 배열 + access: "failed"로 반환하세요.`,
    { label: `scout:${s.key}`, phase: '발굴', agentType: 'community-scout', schema: CANDIDATES_SCHEMA }
  )
))

// 배리어 정당화: 크로스 사이트 랭킹은 전체 후보가 모여야 가능
const results = scouted.filter(Boolean)
const allPosts = results.flatMap(r => r.posts.map(p => ({ ...p, site: r.site })))
const failedSites = results.filter(r => r.access === 'failed').map(r => r.site)
log(`후보 ${allPosts.length}건 발굴 (접근 실패: ${failedSites.length ? failedSites.join(', ') : '없음'})`)

if (allPosts.length === 0) {
  return { date, outDir, candidates: 0, failedSites, items: [], note: '모든 사이트 접근 실패 — 네트워크 정책 확인 필요' }
}

// ── 2단계: 선별
phase('선별')
const pickCount = Math.min(finalCount, allPosts.length)
const selection = await agent(
  `다음은 국내 커뮤니티에서 발굴한 오늘(${date})의 후보 글 목록입니다.\n` +
  `중복(같은 사건/같은 원글의 펌글)을 제거하고, 화제성·vs구도 선명함·재가공 용이성 기준으로 상위 ${pickCount}건을 선별하세요. ` +
  `사이트가 한쪽에 쏠리지 않게 균형을 잡되 품질이 우선입니다. 각 글에 "01-" 형식 번호가 붙은 영문 슬러그를 부여하세요.\n\n` +
  JSON.stringify(allPosts),
  { label: '크로스랭킹', phase: '선별', schema: SELECTION_SCHEMA }
)
log(`${selection.selected.length}건 선정 완료`)

// ── 3~5단계: 글별로 수집 → 각색 → 검수 (글 사이 배리어 없음)
const produced = await pipeline(
  selection.selected,
  (item, _o, i) => agent(
    `수집 대상 글:\n${JSON.stringify(item)}\n출력 디렉토리: ${outDir}\n` +
    `에이전트 정의에 따라 raw/${item.slug}/ 아래에 캡쳐·본문·댓글·이미지를 저장하세요.`,
    { label: `수집:${item.slug}`, phase: '수집', agentType: 'content-collector', schema: COLLECT_SCHEMA }
  ),
  (collected, item) => {
    if (!collected || collected.status === 'failed' || collected.status === 'skipped_nsfw') {
      return { item, collected, draft: null, review: null }
    }
    return agent(
      `각색 대상: ${JSON.stringify(item)}\n소재 위치: ${collected.dir}\n출력 디렉토리: ${outDir}\n` +
      `drafts/${item.slug}.md에 렉카체·커뮤체 두 버전을 작성하세요.`,
      { label: `각색:${item.slug}`, phase: '각색', agentType: 'content-writer', schema: DRAFT_SCHEMA }
    ).then(draft => ({ item, collected, draft }))
  },
  (bundle, item) => {
    if (!bundle || !bundle.draft) return bundle
    return agent(
      `검수 대상 초안: ${bundle.draft.draft_path}\n원 소재: ${bundle.collected.dir}\n원글 정보: ${JSON.stringify(item)}\n` +
      `에이전트 정의의 체크리스트대로 검수하고 판정을 반환하세요.`,
      { label: `검수:${item.slug}`, phase: '검수', agentType: 'content-reviewer', schema: REVIEW_SCHEMA }
    ).then(review => ({ ...bundle, review }))
  }
)

const items = produced.filter(Boolean)
return {
  date,
  outDir,
  candidates: allPosts.length,
  failedSites,
  items: items.map(b => ({
    slug: b.item.slug,
    site: b.item.site,
    title: b.item.title,
    url: b.item.url,
    category: b.item.category,
    collect_status: b.collected ? b.collected.status : 'failed',
    draft_path: b.draft ? b.draft.draft_path : null,
    verdict: b.review ? b.review.verdict : null,
    best_title: b.review ? b.review.best_title : null,
    risk_flags: b.review ? b.review.risk_flags : [],
    edit_requests: b.review ? b.review.edit_requests : [],
  })),
}
