import { searchTrendingProducts, generateAffiliateLink } from '@/lib/coupang'
import { USE_MOCK, mockDelay } from '@/lib/claude-client'
import type { ContentTopic } from './content-discovery-agent'

const MOCK_PRODUCTS: Record<string, { productId: number; productName: string; salePrice: number; commissionRate: number }> = {
  default: { productId: 999001, productName: '[모의] 생활 꿀템 세트', salePrice: 29900, commissionRate: 5 },
  생활용품: { productId: 999002, productName: '[모의] 주방 수납 정리함', salePrice: 19900, commissionRate: 5 },
  유아: { productId: 999003, productName: '[모의] 이유식 용기 세트', salePrice: 34900, commissionRate: 7 },
  스포츠: { productId: 999004, productName: '[모의] 저항밴드 5종 세트', salePrice: 15900, commissionRate: 6 },
  뷰티: { productId: 999005, productName: '[모의] 히알루론산 수분크림', salePrice: 24900, commissionRate: 5 },
  식품: { productId: 999006, productName: '[모의] 견과류 혼합 선물세트', salePrice: 39900, commissionRate: 3 },
}

export interface MatchedProduct {
  productId: number
  productName: string
  productUrl: string
  affiliateLink: string
  salePrice: number
  commissionRate: number
  category: string
  topic: ContentTopic
}

export async function runProductMatchAgent(topics: ContentTopic[]): Promise<MatchedProduct[]> {
  if (USE_MOCK) {
    await mockDelay()
    return topics.map(topic => {
      const mock = MOCK_PRODUCTS[topic.coupang_category] ?? MOCK_PRODUCTS.default
      return {
        productId: mock.productId,
        productName: mock.productName,
        productUrl: `https://www.coupang.com/vp/products/${mock.productId}`,
        affiliateLink: `https://link.coupang.com/a/mock_${mock.productId}`,
        salePrice: mock.salePrice,
        commissionRate: mock.commissionRate,
        category: topic.coupang_category,
        topic,
      }
    })
  }

  const results: MatchedProduct[] = []

  for (const topic of topics) {
    // Use the most relevant hook keyword for Coupang search
    const searchKeyword = topic.hook_keywords[0] ?? topic.coupang_category

    try {
      const products = await searchTrendingProducts(searchKeyword, 3)

      // Pick the product with highest commission rate, or first if same rate
      const best = products.sort((a: typeof products[0], b: typeof products[0]) => {
        // Prefer rating > 4.0 and ratingCount > 100 first
        const aQuality = a.rating >= 4.0 && a.ratingCount >= 100 ? 1 : 0
        const bQuality = b.rating >= 4.0 && b.ratingCount >= 100 ? 1 : 0
        if (aQuality !== bQuality) return bQuality - aQuality
        return b.commissionRate - a.commissionRate
      })[0]

      if (!best) continue

      const affiliate = await generateAffiliateLink(best.productUrl, best.productId, best.commissionRate)

      results.push({
        productId: best.productId,
        productName: best.productName,
        productUrl: best.productUrl,
        affiliateLink: affiliate.shortUrl,
        salePrice: best.salePrice,
        commissionRate: best.commissionRate,
        category: best.categoryName,
        topic,
      })
    } catch {
      // Skip this topic if product search fails
      continue
    }
  }

  return results
}
