import { searchTrendingProducts, generateAffiliateLink } from '@/lib/coupang'
import type { ContentTopic } from './content-discovery-agent'

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
