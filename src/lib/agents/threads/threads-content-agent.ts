import { generateJSON, USE_MOCK, mockDelay } from '@/lib/claude-client'
import type { MatchedProduct } from './product-match-agent'

// Required Korean affiliate disclosure text (법적 고지)
const AFFILIATE_DISCLOSURE = '이 게시물은 쿠팡 파트너스 활동의 일환으로, 일정액의 수수료를 제공받습니다.'

interface GeneratedPost {
  hook: string
  body: string
  full_text: string
  tone: string
}

interface ContentVariants {
  posts: GeneratedPost[]
}

const SYSTEM_PROMPT = `당신은 Threads 쇼핑 콘텐츠 전문 크리에이터입니다.

Threads 게시글 작성 원칙:
1. 훅(첫 줄): 스크롤을 멈추게 하는 짧고 강렬한 문장 (20자 이내)
2. 본문: 공감 or 꿀팁 스토리 + 자연스러운 제품 언급 (100-150자)
3. 링크: 쿠팡 파트너스 단축 URL
4. 해시태그: 2-3개 (Threads 특성상 과다 해시태그 금지)
5. 법적 고지: 반드시 포함 (이미 템플릿에 포함됨)

금지사항:
- "광고", "후기" 등 노골적 광고 표현
- 5개 이상 해시태그
- 동일 표현 반복

계정별 톤앤매너:
- A타입: 일상 공감형 (친근하고 편안한)
- B타입: 꿀팁/정보형 (유용하고 간결한)
- C타입: 유머형 (가볍고 재미있는)
- D타입: 감성형 (따뜻하고 공감되는)

반드시 JSON으로만 응답:
{
  "posts": [
    {
      "hook": "훅 문장",
      "body": "본문 내용",
      "full_text": "훅\\n\\n본문\\n\\n링크\\n\\n해시태그\\n\\n법적고지",
      "tone": "A타입/B타입/C타입/D타입"
    }
  ]
}`

function buildFullText(hook: string, body: string, affiliateLink: string, tone: string): string {
  const hashtags: Record<string, string> = {
    'A타입': '#생활꿀팁 #쿠팡추천',
    'B타입': '#꿀팁 #추천템',
    'C타입': '#공감 #이거진짜야',
    'D타입': '#일상 #소소한행복',
  }
  const tag = hashtags[tone] ?? '#생활꿀팁'
  return `${hook}\n\n${body}\n\n${affiliateLink}\n\n${tag}\n\n${AFFILIATE_DISCLOSURE}`
}

export interface ThreadsPostContent {
  account_tone: string
  hook: string
  body: string
  full_text: string
  product: MatchedProduct
}

export async function runThreadsContentAgent(
  products: MatchedProduct[],
  accountCount: number
): Promise<ThreadsPostContent[]> {
  if (USE_MOCK) {
    await mockDelay()
    return products.reduce<ThreadsPostContent[]>((acc, p) => {
      const tones = ['A타입', 'B타입', 'C타입', 'D타입']
      return acc.concat(tones.slice(0, Math.min(4, accountCount)).map(tone => ({
        account_tone: tone,
        hook: `이거 진짜 써봤는데 대박이에요 🫢`,
        body: `${p.productName} 쓰고 나서 완전 달라졌어요.\n${p.topic.trending_angle} 관점에서 추천드려요!`,
        full_text: buildFullText('이거 진짜 써봤는데 대박이에요 🫢', `${p.productName} 추천합니다`, p.affiliateLink, tone),
        product: p,
      })))
    }, [])
  }

  const results: ThreadsPostContent[] = []

  for (const product of products) {
    const userPrompt = `다음 제품에 대한 Threads 게시글을 4개의 다른 톤으로 작성해주세요.

제품명: ${product.productName}
카테고리: ${product.category}
가격: ${product.salePrice.toLocaleString()}원
콘텐츠 앵글: ${product.topic.trending_angle}
훅 키워드: ${product.topic.hook_keywords.join(', ')}
링크: ${product.affiliateLink}

각 톤(A타입/B타입/C타입/D타입)으로 1개씩 총 4개 작성.
full_text에 링크와 법적 고지 포함: "${AFFILIATE_DISCLOSURE}"`

    try {
      const variants = await generateJSON<ContentVariants>(SYSTEM_PROMPT, userPrompt)

      for (const post of variants.posts) {
        // Ensure full_text always has the affiliate link and disclosure
        const fullText = post.full_text.includes(AFFILIATE_DISCLOSURE)
          ? post.full_text
          : buildFullText(post.hook, post.body, product.affiliateLink, post.tone)

        results.push({
          account_tone: post.tone,
          hook: post.hook,
          body: post.body,
          full_text: fullText,
          product,
        })
      }
    } catch {
      // Generate fallback content if AI fails
      const tones = ['A타입', 'B타입', 'C타입', 'D타입']
      for (const tone of tones) {
        const hook = `이거 진짜 ${product.topic.hook_keywords[0] ?? '꿀템'}이에요`
        const body = `${product.productName} — ${product.topic.trending_angle} 콘텐츠\n${product.salePrice.toLocaleString()}원`
        results.push({
          account_tone: tone,
          hook,
          body,
          full_text: buildFullText(hook, body, product.affiliateLink, tone),
          product,
        })
      }
    }
  }

  // Return up to accountCount posts
  return results.slice(0, accountCount)
}
