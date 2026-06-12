"""
SEO競合調査モジュール — リアルタイム競合発見 + キーワード網羅的分析
Regalis Dynamic AIO v2.0

処理フロー:
  1. キーワードカタログ構築（52キーワード + config拡張）
  2. CompetitorDiscovery: DuckDuckGo SERPから実際の競合を自動発見
     → カテゴリ代表キーワードで検索 → ドメイン集計 → スコアリング
  3. CompetitorScraper: 発見された競合ページをスクレイピング
  4. SEOCompetitorAnalyzer: ギャップ分析 + トラフィック損失スコアリング
  5. SEOReportGenerator: JSON + Markdown レポート生成

Usage:
  python main.py --seo-report            # 自動発見 + フルレポート
  python main.py --seo-report --dry-run  # ファイル保存なし（標準出力）
"""

import re
import time
import json
import logging
import hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urljoin, urlparse

try:
    import requests
    from bs4 import BeautifulSoup
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

try:
    from ddgs import DDGS
    HAS_DDG = True
except ImportError:
    try:
        from duckduckgo_search import DDGS  # 旧パッケージ名フォールバック
        HAS_DDG = True
    except ImportError:
        HAS_DDG = False

logger = logging.getLogger(__name__)
JST = timezone(timedelta(hours=9))

# ──────────────────────────────────────────────
# CTRカーブ (Advanced Web Ranking 2024)
# ──────────────────────────────────────────────
CTR_CURVE = {1: 0.285, 2: 0.157, 3: 0.110, 4: 0.080,
             5: 0.072, 6: 0.051, 7: 0.040, 8: 0.033,
             9: 0.026, 10: 0.021}
CTR_NOT_RANKING = 0.0
CTR_PAGE2 = 0.005


# ══════════════════════════════════════════════════════════════
# データクラス
# ══════════════════════════════════════════════════════════════

@dataclass
class KeywordDef:
    keyword: str
    monthly_volume: int
    difficulty: str               # low / medium / high
    intent: str                   # informational / commercial / transactional
    category: str
    is_ai_query: bool = False
    our_estimated_rank: Optional[int] = None
    notes: str = ""


@dataclass
class SERPEntry:
    """1件のSERP検索結果"""
    keyword: str
    position: int
    url: str
    title: str
    snippet: str
    domain: str


@dataclass
class DiscoveredCompetitor:
    """SERPから発見された競合ドメイン"""
    domain: str
    representative_url: str       # 最も多く登場したURL
    name: str                     # ドメインから推定した会社名
    appearances: int              # 登場キーワード数
    avg_position: float           # 平均掲載順位（低いほど良い）
    best_position: int            # 最良掲載順位
    keywords_found: list[str]     # 登場したキーワード一覧
    discovery_score: float        # 0.0〜10.0（高いほど重要な競合）
    category: str = "discovered"  # SERP発見 or preset
    serp_entries: list[SERPEntry] = field(default_factory=list)


@dataclass
class CompetitorDef:
    """競合サイト定義（スクレイピング対象）"""
    name: str
    url: str
    category: str
    price_monthly: Optional[int] = None
    notes: str = ""
    discovery_score: float = 0.0
    is_discovered: bool = False   # SERPから自動発見されたか


@dataclass
class CompetitorPageData:
    competitor_name: str
    url: str
    title: str = ""
    meta_description: str = ""
    h1: str = ""
    headings: list[str] = field(default_factory=list)
    body_text: str = ""
    word_count: int = 0
    detected_keywords: list[str] = field(default_factory=list)
    price_mentions: list[str] = field(default_factory=list)
    has_aio_content: bool = False
    has_llmo_content: bool = False
    has_price_transparency: bool = False
    fetched_ok: bool = True
    error: str = ""
    scraped_at: str = ""


@dataclass
class KeywordGap:
    keyword: KeywordDef
    covered_by_us: bool
    covered_by_competitors: list[str]
    our_rank: Optional[int]
    best_competitor_rank: Optional[int]
    traffic_loss_monthly: int
    opportunity_score: float


@dataclass
class CompetitorComparison:
    competitor: CompetitorDef
    page_data: CompetitorPageData
    keyword_coverage_count: int
    keyword_coverage_pct: float
    has_price_page: bool
    aio_readiness_score: int
    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)


@dataclass
class TrafficLossScore:
    total_keywords: int
    covered_keywords: int
    missing_keywords: int
    total_monthly_volume: int
    estimated_reachable_volume: int
    current_estimated_traffic: int
    monthly_traffic_loss: int
    annual_traffic_loss: int
    coverage_score: float
    aio_score: float
    overall_score: float
    top_opportunity_keywords: list[KeywordGap] = field(default_factory=list)


@dataclass
class SEOCompetitorReport:
    generated_at: str
    site_url: str
    traffic_loss: TrafficLossScore
    competitor_comparisons: list[CompetitorComparison]
    keyword_gaps: list[KeywordGap]
    recommendations: list[str]
    discovered_competitors: list[DiscoveredCompetitor] = field(default_factory=list)
    markdown_report: str = ""


# ══════════════════════════════════════════════════════════════
# キーワードカタログ（メディくる 専用 — 採用・企業ブランディング領域）
# ══════════════════════════════════════════════════════════════

def build_keyword_catalog(extra_keywords: list[dict] = None) -> list[KeywordDef]:
    keywords = [
        # ── 採用ブランディング ──────────────────────────────────────
        KeywordDef("採用ブランディング", 3600, "high", "commercial", "recruit"),
        KeywordDef("採用ブランディング 会社", 1800, "high", "commercial", "recruit"),
        KeywordDef("採用ブランディング 代行", 1200, "medium", "commercial", "recruit"),
        KeywordDef("採用ブランディング 費用", 880, "medium", "commercial", "recruit"),
        KeywordDef("採用ブランディング 事例", 1100, "medium", "informational", "recruit"),
        KeywordDef("採用ブランディング とは", 2200, "medium", "informational", "recruit"),
        KeywordDef("採用広報 会社", 920, "medium", "commercial", "recruit"),
        KeywordDef("採用広報 代行", 740, "medium", "commercial", "recruit"),
        KeywordDef("採用マーケティング 会社", 650, "medium", "commercial", "recruit"),
        KeywordDef("採用ブランディング 中小企業", 580, "medium", "commercial", "recruit"),
        KeywordDef("求職者 会社名 検索 対策", 320, "low", "commercial", "recruit",
                   notes="メディくるのコアターゲットKW"),
        # ── 企業・商品ブランディング ────────────────────────────────
        KeywordDef("企業ブランディング 会社", 2400, "high", "commercial", "brand"),
        KeywordDef("企業ブランディング 代行", 1600, "high", "commercial", "brand"),
        KeywordDef("企業ブランディング 費用", 980, "medium", "commercial", "brand"),
        KeywordDef("企業ブランディング 東京", 1100, "high", "commercial", "brand"),
        KeywordDef("商品ブランディング 会社", 1200, "medium", "commercial", "brand"),
        KeywordDef("ブランディング 会社 おすすめ", 1900, "high", "commercial", "brand"),
        KeywordDef("ブランディング 代行 中小企業", 860, "medium", "commercial", "brand"),
        KeywordDef("企業イメージ 改善 会社", 540, "medium", "commercial", "brand"),
        KeywordDef("ブランディング 費用 相場", 1300, "medium", "commercial", "brand"),
        # ── 指名検索・ネットニュース ────────────────────────────────
        KeywordDef("指名検索 対策", 720, "medium", "commercial", "branded_search",
                   notes="メディくるのコアサービスKW"),
        KeywordDef("指名検索 ブランディング", 480, "low", "commercial", "branded_search"),
        KeywordDef("指名検索 増やす", 390, "low", "commercial", "branded_search"),
        KeywordDef("ネットニュース 掲載 代行", 650, "medium", "commercial", "media"),
        KeywordDef("ネットニュース 掲載 費用", 420, "low", "commercial", "media"),
        KeywordDef("プレスリリース 配信 代行", 1100, "medium", "commercial", "media"),
        KeywordDef("メディア掲載 ブランディング", 380, "low", "commercial", "media"),
        KeywordDef("ニュースサイト 掲載 PR", 490, "low", "commercial", "media"),
        # ── AI検索時代・LLMO対応 ───────────────────────────────────
        KeywordDef("AI検索 対策 会社", 580, "medium", "commercial", "ai_search"),
        KeywordDef("AI検索 ブランディング", 320, "low", "commercial", "ai_search",
                   notes="新興KW・早期獲得チャンス"),
        KeywordDef("ChatGPT 検索 会社名", 280, "low", "informational", "ai_search"),
        KeywordDef("Perplexity 企業情報 対策", 200, "low", "commercial", "ai_search"),
        # ── 価格・比較・CV系 ────────────────────────────────────────
        KeywordDef("採用ブランディング 料金 比較", 460, "low", "commercial", "price"),
        KeywordDef("企業ブランディング 料金 相場", 680, "medium", "commercial", "price"),
        KeywordDef("ブランディング会社 比較 2026", 520, "medium", "commercial", "price"),
        # ── AI検索向けロングテール ────────────────────────────────
        KeywordDef(
            "求職者が会社名を検索したときに好印象を与えるブランディング会社",
            180, "low", "commercial", "ai_query", is_ai_query=True),
        KeywordDef(
            "採用ブランディングを中小企業向けに安く依頼できる会社",
            150, "low", "commercial", "ai_query", is_ai_query=True),
        KeywordDef(
            "大手ネットニュースに掲載して企業の信頼性を高めるサービス",
            130, "low", "commercial", "ai_query", is_ai_query=True),
        KeywordDef(
            "採用ブランディングと企業ブランディングを一社で対応できる会社",
            120, "low", "commercial", "ai_query", is_ai_query=True),
        KeywordDef(
            "AI検索時代に選ばれる企業になるためのブランディング会社",
            100, "low", "commercial", "ai_query", is_ai_query=True),
        KeywordDef(
            "Infoseekニュースやエキサイトニュースに掲載できる会社",
            90, "low", "transactional", "ai_query", is_ai_query=True),
        KeywordDef(
            "採用ブランディング 会社名検索 改善 代行",
            80, "low", "commercial", "ai_query", is_ai_query=True),
    ]
    if extra_keywords:
        for kw in extra_keywords:
            keywords.append(KeywordDef(**kw))
    return keywords


# ══════════════════════════════════════════════════════════════
# CompetitorDiscovery — DuckDuckGo SERPから競合をリアルタイム発見
# ══════════════════════════════════════════════════════════════

# 競合ではない除外ドメイン（比較サイト・メディア・SNS等）
EXCLUDE_DOMAINS: set[str] = {
    # 自サイト
    "regalis-order-suits.com",
    # 汎用情報
    "wikipedia.org", "ja.wikipedia.org", "wikihow.com", "wikibooks.org",
    # SNS・プラットフォーム
    "twitter.com", "x.com", "facebook.com", "instagram.com",
    "linkedin.com", "youtube.com", "tiktok.com", "note.com",
    "qiita.com", "zenn.dev", "hatena.ne.jp", "hatenablog.com",
    # 求人
    "indeed.com", "recruit.co.jp", "mynavi.jp", "doda.jp",
    "wantedly.com", "green-japan.com",
    # 検索エンジン
    "google.com", "google.co.jp", "yahoo.co.jp", "bing.com", "baidu.com",
    # ニュース・メディア
    "nhk.or.jp", "nikkei.com", "yomiuri.co.jp", "asahi.com",
    "mainichi.jp", "sankei.com", "buzzfeed.com",
    # EC
    "amazon.co.jp", "rakuten.co.jp", "mercari.com",
    # 行政
    "go.jp", "meti.go.jp", "soumu.go.jp",
    # 比較・まとめサイト（競合ではない）
    "aspicjapan.org", "itreview.jp", "boxil.jp", "appier.com",
    "ferret-one.com", "marketo.com", "hubspot.com",
    "prtimes.jp", "atpress.ne.jp",
    # 学術・教育
    "ac.jp", "edu",
    # その他
    "freee.co.jp", "sansan.com",
}

# カテゴリ別「発見用」代表キーワード（検索回数を絞るため1〜2件/カテゴリ）
DISCOVERY_KEYWORDS_BY_CATEGORY: dict[str, list[str]] = {
    "recruit":        ["採用ブランディング 会社", "採用ブランディング 代行"],
    "brand":          ["企業ブランディング 会社", "ブランディング 会社 おすすめ"],
    "branded_search": ["指名検索 対策", "指名検索 ブランディング"],
    "media":          ["ネットニュース 掲載 代行", "プレスリリース 配信 代行"],
    "ai_search":      ["AI検索 対策 会社"],
}


class CompetitorDiscovery:
    """
    DuckDuckGo検索結果から実際の競合サイトをリアルタイムで発見する。

    アルゴリズム:
      1. カテゴリ代表キーワードでDDG検索（上位10件）
      2. 除外ドメインをフィルタリング
      3. ドメイン別に登場回数・平均順位を集計
      4. discovery_score = 登場率 × (1/平均順位) で重み付け
      5. 上位 top_n 件を DiscoveredCompetitor として返す
    """

    def __init__(self, config: dict):
        cfg = config.get("seo_competitor", {})
        self.top_n        = cfg.get("discovery_top_n", 10)
        self.max_results  = cfg.get("discovery_serp_results", 10)
        self.search_delay = cfg.get("discovery_search_delay", 2.0)
        self.cache_dir    = Path(cfg.get("cache_dir", "data/competitor_cache"))
        self.cache_ttl    = cfg.get("discovery_cache_ttl", 43200)  # 12時間
        self.our_domain   = urlparse(
            config.get("site", {}).get("url", "")).netloc
        self._extra_excludes: set[str] = set(
            cfg.get("exclude_domains", []))

    @staticmethod
    def _strip_www(domain: str) -> str:
        d = domain.lower()
        return d[4:] if d.startswith("www.") else d

    def _is_excluded(self, domain: str) -> bool:
        d = self._strip_www(domain)
        if d == self._strip_www(self.our_domain):
            return True
        if d in EXCLUDE_DOMAINS or d in self._extra_excludes:
            return True
        # サブドメイン含む除外（例: ja.wikipedia.org → wikipedia.org）
        if any(d == ex or d.endswith("." + ex) for ex in EXCLUDE_DOMAINS):
            return True
        # TLD判定（.go.jp, .ac.jp 等）
        if any(d.endswith(tld) for tld in [".go.jp", ".ac.jp", ".ed.jp"]):
            return True
        return False

    def _normalize_domain(self, url: str) -> str:
        """URLからドメイン（www.なし）を取得"""
        parsed = urlparse(url)
        return parsed.netloc.lstrip("www.").lower()

    # タイトルから会社名を除去するノイズパターン
    _TITLE_NOISE = re.compile(
        r'^【[^】]*】|^「[^」]*」|\d{4}年[最新版]*|おすすめ.*|比較.*|一覧.*'
        r'|選$|選！.*|！.*|….*|\|.*|｜.*| - .*| — .*',
        re.DOTALL,
    )

    def _infer_name(self, domain: str, title: str) -> str:
        """ドメイン・タイトルから会社名を推定（ノイズ除去版）"""
        # 末尾区切り文字後の部分（「タイトル | 会社名」形式）を優先
        for sep in [" | ", " ｜ ", " - ", " — "]:
            if sep in title:
                parts = title.split(sep)
                candidate = parts[-1].strip()   # 末尾が会社名のことが多い
                clean = self._TITLE_NOISE.sub("", candidate).strip()
                if 2 < len(clean) < 25:
                    return clean
                candidate = parts[0].strip()    # 先頭も試す
                clean = self._TITLE_NOISE.sub("", candidate).strip()
                if 2 < len(clean) < 25:
                    return clean
        # 区切りなしの場合：ノイズを除去した上でタイトルの先頭語を使う
        clean_title = self._TITLE_NOISE.sub("", title).strip()
        if 2 < len(clean_title) < 20:
            return clean_title
        # 最終フォールバック: ドメインの第一ラベル
        label = domain.split(".")[0]
        return label.upper() if len(label) <= 5 else label.capitalize()

    def _cache_path(self, keyword: str) -> Path:
        key = hashlib.md5(keyword.encode()).hexdigest()
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        return self.cache_dir / f"serp_{key}.json"

    def _load_serp_cache(self, keyword: str) -> Optional[list[SERPEntry]]:
        p = self._cache_path(keyword)
        if not p.exists():
            return None
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if time.time() - data.get("_ts", 0) > self.cache_ttl:
                return None
            return [SERPEntry(**e) for e in data.get("entries", [])]
        except Exception:
            return None

    def _save_serp_cache(self, keyword: str, entries: list[SERPEntry]):
        p = self._cache_path(keyword)
        data = {
            "_ts": time.time(),
            "entries": [e.__dict__ for e in entries],
        }
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                     encoding="utf-8")

    def _search_ddg(self, keyword: str) -> list[SERPEntry]:
        """DuckDuckGoで検索してSERPエントリリストを返す"""
        cached = self._load_serp_cache(keyword)
        if cached is not None:
            logger.debug(f"SERPキャッシュ使用: {keyword}")
            return cached

        if not HAS_DDG:
            logger.warning("duckduckgo-search が未インストール。pip install duckduckgo-search")
            return []

        entries: list[SERPEntry] = []
        try:
            time.sleep(self.search_delay)
            with DDGS() as ddgs:
                results = list(ddgs.text(
                    keyword,
                    max_results=self.max_results,
                ))
            for pos, r in enumerate(results, 1):
                url     = r.get("href", "")
                title   = r.get("title", "")
                snippet = r.get("body", "")
                domain  = self._normalize_domain(url)
                if not url or not domain:
                    continue
                entries.append(SERPEntry(
                    keyword=keyword, position=pos,
                    url=url, title=title, snippet=snippet, domain=domain,
                ))
            logger.info(f"DDG検索完了: 「{keyword}」 → {len(entries)}件")
            self._save_serp_cache(keyword, entries)
        except Exception as e:
            logger.warning(f"DDG検索エラー: 「{keyword}」 — {e}")

        return entries

    def discover(self, keywords: list[KeywordDef] = None) -> list[DiscoveredCompetitor]:
        """
        カテゴリ代表キーワードで検索を実行し、
        競合ドメインを集計・スコアリングして返す。
        """
        # 発見対象キーワードを決定
        search_queries: list[str] = []
        for cat, kw_list in DISCOVERY_KEYWORDS_BY_CATEGORY.items():
            search_queries.extend(kw_list)

        total_queries = len(search_queries)
        logger.info(f"競合発見: {total_queries}クエリで検索開始")

        # 全SERP結果を収集
        all_entries: list[SERPEntry] = []
        for kw in search_queries:
            entries = self._search_ddg(kw)
            all_entries.extend(entries)

        # ドメイン別に集計
        domain_data: dict[str, dict] = {}
        for entry in all_entries:
            d = entry.domain
            if self._is_excluded(d):
                continue
            if d not in domain_data:
                domain_data[d] = {
                    "urls": {},        # url: count
                    "positions": [],
                    "keywords": set(),
                    "titles": {},      # url: title
                    "entries": [],
                }
            dd = domain_data[d]
            dd["positions"].append(entry.position)
            dd["keywords"].add(entry.keyword)
            dd["entries"].append(entry)
            # 代表URLはアクセス数（登場数）が多いものを優先
            dd["urls"][entry.url] = dd["urls"].get(entry.url, 0) + 1
            dd["titles"][entry.url] = entry.title

        # スコアリング
        discovered: list[DiscoveredCompetitor] = []
        for domain, dd in domain_data.items():
            appearances  = len(dd["keywords"])
            avg_pos      = sum(dd["positions"]) / len(dd["positions"])
            best_pos     = min(dd["positions"])
            # 代表URL（最も頻出）
            rep_url      = max(dd["urls"], key=dd["urls"].get)
            rep_title    = dd["titles"].get(rep_url, "")
            name         = self._infer_name(domain, rep_title)

            # discovery_score (0〜10):
            #   複数KW登場ボーナス: appearances^1.5 / total_queries * 5 → 複数登場を強く優遇
            #   上位表示ボーナス: (1/avg_pos) * 3                        → 最大3点（1位なら3点）
            #   最良順位ボーナス: max(0, (5-best_pos)/5) * 2             → 最大2点（1位なら2点）
            score = round(
                (appearances ** 1.5 / total_queries) * 5.0 +
                (1.0 / avg_pos) * 3.0 +
                max(0.0, (5 - best_pos) / 5.0) * 2.0,
                2,
            )

            discovered.append(DiscoveredCompetitor(
                domain=domain,
                representative_url=rep_url,
                name=name,
                appearances=appearances,
                avg_position=round(avg_pos, 1),
                best_position=best_pos,
                keywords_found=sorted(dd["keywords"]),
                discovery_score=score,
                serp_entries=dd["entries"],
            ))

        # スコア降順
        discovered.sort(key=lambda c: c.discovery_score, reverse=True)
        top = discovered[:self.top_n]

        logger.info(
            f"競合発見完了: {len(discovered)}ドメイン → 上位{len(top)}件を採用"
        )
        for c in top:
            logger.info(
                f"  [{c.discovery_score:.2f}] {c.domain}"
                f" (登場{c.appearances}KW / 平均{c.avg_position}位)"
            )

        return top

    def to_competitor_defs(
        self, discovered: list[DiscoveredCompetitor]
    ) -> list[CompetitorDef]:
        """DiscoveredCompetitor → CompetitorDef（スクレイピング用）に変換"""
        defs = []
        for d in discovered:
            # カテゴリを登場キーワードから推定
            kw_str = " ".join(d.keywords_found).lower()
            if any(t in kw_str for t in ["aio", "llmo", "ai検索"]):
                cat = "aio"
            elif any(t in kw_str for t in ["dx", "ai活用", "コンサル"]):
                cat = "dx"
            elif any(t in kw_str for t in ["web制作", "サイト制作"]):
                cat = "web"
            else:
                cat = "seo"

            defs.append(CompetitorDef(
                name=d.name,
                url=d.representative_url,
                category=cat,
                notes=f"SERP発見: {d.appearances}KWで登場, 平均{d.avg_position}位",
                discovery_score=d.discovery_score,
                is_discovered=True,
            ))
        return defs


# ══════════════════════════════════════════════════════════════
# CompetitorScraper — 競合ページスクレイピング
# ══════════════════════════════════════════════════════════════

class CompetitorScraper:
    AIO_SIGNALS = [
        "AIO", "LLMO", "GEO", "AEO", "AI検索", "生成AI", "Perplexity",
        "ChatGPT", "Gemini", "llms.txt", "AI最適化", "Answer Engine",
        "Generative Engine", "AI概要", "SGE",
    ]

    def __init__(self, config: dict):
        cfg = config.get("extractor", {})
        self.delay    = cfg.get("delay_seconds", 2.0)
        self.timeout  = cfg.get("timeout", 12)
        self.ua       = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
        cache_dir = config.get("seo_competitor", {}).get(
            "cache_dir", "data/competitor_cache")
        self.cache_dir = Path(cache_dir)
        self.cache_ttl = cfg.get("cache_ttl", 21600)

    def _cache_path(self, url: str) -> Path:
        key = hashlib.md5(url.encode()).hexdigest()
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        return self.cache_dir / f"page_{key}.json"

    def _load_cache(self, url: str) -> Optional[CompetitorPageData]:
        p = self._cache_path(url)
        if not p.exists():
            return None
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if time.time() - data.get("_ts", 0) > self.cache_ttl:
                return None
            data.pop("_ts", None)
            return CompetitorPageData(**data)
        except Exception:
            return None

    def _save_cache(self, url: str, page: CompetitorPageData):
        p = self._cache_path(url)
        data = page.__dict__.copy()
        data["_ts"] = time.time()
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                     encoding="utf-8")

    def scrape(self, competitor: CompetitorDef) -> CompetitorPageData:
        cached = self._load_cache(competitor.url)
        if cached:
            logger.debug(f"ページキャッシュ使用: {competitor.name}")
            return cached

        page = CompetitorPageData(
            competitor_name=competitor.name,
            url=competitor.url,
            scraped_at=datetime.now(JST).isoformat(),
        )

        if not HAS_REQUESTS:
            page.fetched_ok = False
            page.error = "requests/beautifulsoup4 が未インストール"
            return page

        try:
            time.sleep(self.delay)
            resp = requests.get(
                competitor.url, timeout=self.timeout,
                headers={"User-Agent": self.ua,
                         "Accept-Language": "ja,en;q=0.9",
                         "Accept": "text/html,application/xhtml+xml"},
                allow_redirects=True,
            )
            resp.raise_for_status()
            resp.encoding = resp.apparent_encoding
            soup = BeautifulSoup(resp.text, "lxml")

            # タイトル
            t = soup.find("title")
            page.title = t.get_text(strip=True)[:120] if t else ""

            # メタ
            d = soup.find("meta", attrs={"name": "description"}) or \
                soup.find("meta", attrs={"property": "og:description"})
            page.meta_description = d.get("content", "")[:200] if d else ""

            # H1
            h1 = soup.find("h1")
            page.h1 = h1.get_text(strip=True)[:100] if h1 else ""

            # H2/H3
            page.headings = [
                t.get_text(strip=True)[:80]
                for t in soup.find_all(["h2", "h3"])[:20]
                if t.get_text(strip=True)
            ]

            # ボディテキスト
            main = (soup.find("article") or soup.find("main")
                    or soup.find("body"))
            if main:
                raw = main.get_text(separator=" ", strip=True)
                page.body_text  = raw[:3000]
                page.word_count = len(re.findall(r'\S+', raw))

            # 価格情報
            price_re = re.compile(
                r'(?:¥|￥|月額|費用|料金)[^\n]{0,5}?[\d,]+'
                r'(?:円|万円)?|[\d,]+(?:円|万円)(?:/月|/year|～)?',
                re.IGNORECASE,
            )
            all_text = page.body_text + " " + page.title
            page.price_mentions = list(set(
                m.group(0).strip()
                for m in price_re.finditer(all_text)
            ))[:10]
            page.has_price_transparency = bool(page.price_mentions)

            # AIO/LLMO判定
            full = all_text + " " + " ".join(page.headings)
            page.has_aio_content = any(
                s.lower() in full.lower() for s in self.AIO_SIGNALS)
            page.has_llmo_content = any(
                s.lower() in full.lower() for s in ["llmo", "llm最適化"])

            # キーワード検出
            kw_re = re.compile(
                r'\b(?:SEO|AIO|LLMO|GEO|AEO|DX|AI|LP|CMS|CTA|KPI|ROAS|ROI'
                r'|コンテンツマーケティング|オウンドメディア|インバウンド'
                r'|ペルソナ|カスタマージャーニー|リード|コンバージョン)\b'
            )
            page.detected_keywords = list(set(kw_re.findall(full)))

            self._save_cache(competitor.url, page)
            logger.info(
                f"スクレイプ完了: {competitor.name} "
                f"({page.word_count}words, AIO={page.has_aio_content})"
            )

        except requests.exceptions.Timeout:
            page.fetched_ok = False
            page.error = f"タイムアウト ({self.timeout}s)"
        except requests.exceptions.HTTPError as e:
            page.fetched_ok = False
            page.error = f"HTTP {e.response.status_code}"
        except Exception as e:
            page.fetched_ok = False
            page.error = str(e)[:100]
            logger.error(f"スクレイプ失敗: {competitor.name} — {e}")

        return page

    def scrape_all(self, competitors: list[CompetitorDef]) -> list[CompetitorPageData]:
        return [self.scrape(c) for c in competitors]


# ══════════════════════════════════════════════════════════════
# SEOCompetitorAnalyzer — ギャップ分析・スコアリング
# ══════════════════════════════════════════════════════════════

class SEOCompetitorAnalyzer:

    def __init__(self, config: dict):
        cfg = config.get("seo_competitor", {})
        self.top_opportunity_limit = cfg.get("top_opportunity_limit", 10)

    def _keyword_in_page(self, keyword: str, page: CompetitorPageData) -> bool:
        text = " ".join([
            page.title, page.meta_description, page.h1,
            " ".join(page.headings), page.body_text,
        ]).lower()
        return all(p in text for p in keyword.lower().split())

    def _ctr(self, rank: Optional[int]) -> float:
        if rank is None:
            return CTR_NOT_RANKING
        return CTR_CURVE.get(rank, CTR_PAGE2 if rank and rank <= 20 else 0.0)

    def _opportunity_score(self, kw: KeywordDef, n_competitors: int) -> float:
        vol  = min(kw.monthly_volume / 500, 5.0)
        gap  = min(n_competitors * 0.8, 3.0)
        diff = {"low": 2.0, "medium": 1.0, "high": 0.0}.get(kw.difficulty, 1.0)
        return round(vol + gap + diff, 1)

    def analyze_gaps(
        self,
        keywords: list[KeywordDef],
        pages: list[CompetitorPageData],
    ) -> list[KeywordGap]:
        gaps = []
        for kw in keywords:
            covered_by = [
                p.competitor_name
                for p in pages
                if p.fetched_ok and self._keyword_in_page(kw.keyword, p)
            ]
            our_ctr  = self._ctr(kw.our_estimated_rank)
            best_ctr = self._ctr(1) if covered_by else 0.0
            loss     = max(0, int(kw.monthly_volume * (best_ctr - our_ctr)))
            gaps.append(KeywordGap(
                keyword=kw,
                covered_by_us=kw.our_estimated_rank is not None,
                covered_by_competitors=covered_by,
                our_rank=kw.our_estimated_rank,
                best_competitor_rank=1 if covered_by else None,
                traffic_loss_monthly=loss,
                opportunity_score=self._opportunity_score(kw, len(covered_by)),
            ))
        gaps.sort(key=lambda g: g.opportunity_score, reverse=True)
        return gaps

    def build_competitor_comparisons(
        self,
        competitors: list[CompetitorDef],
        pages: list[CompetitorPageData],
        keywords: list[KeywordDef],
    ) -> list[CompetitorComparison]:
        page_map = {p.competitor_name: p for p in pages}
        comparisons = []
        for comp in competitors:
            page = page_map.get(comp.name)
            if not page:
                continue
            covered = sum(
                1 for kw in keywords
                if page.fetched_ok and self._keyword_in_page(kw.keyword, page)
            )
            cov_pct = round(covered / len(keywords) * 100, 1) if keywords else 0.0
            # AIOスコア
            aio = 0
            if page.has_aio_content:  aio += 40
            if page.has_llmo_content: aio += 30
            if any(s in page.body_text for s in ["llms.txt", "GPTBot"]): aio += 20
            if cov_pct > 50:          aio += 10
            # 強み/弱み
            strengths, weaknesses = [], []
            if page.word_count > 2000:
                strengths.append(f"コンテンツ量:{page.word_count}words")
            else:
                weaknesses.append(f"コンテンツ不足:{page.word_count}words")
            if page.has_price_transparency:
                strengths.append("価格開示あり")
            else:
                weaknesses.append("価格非公開")
            if page.has_aio_content:
                strengths.append("AIO/LLMO対応コンテンツ")
            else:
                weaknesses.append("AIO未対応")
            if comp.price_monthly and comp.price_monthly >= 200000:
                weaknesses.append(f"高価格帯(¥{comp.price_monthly:,}〜/月)")
            if cov_pct > 60:
                strengths.append(f"高KWカバレッジ({cov_pct}%)")

            comparisons.append(CompetitorComparison(
                competitor=comp, page_data=page,
                keyword_coverage_count=covered,
                keyword_coverage_pct=cov_pct,
                has_price_page=page.has_price_transparency,
                aio_readiness_score=min(aio, 100),
                strengths=strengths, weaknesses=weaknesses,
            ))
        comparisons.sort(key=lambda c: c.keyword_coverage_pct, reverse=True)
        return comparisons

    def score_traffic_loss(
        self,
        keywords: list[KeywordDef],
        gaps: list[KeywordGap],
    ) -> TrafficLossScore:
        total_vol = sum(kw.monthly_volume for kw in keywords)
        covered   = sum(1 for g in gaps if g.covered_by_us)
        max_reach = int(total_vol * CTR_CURVE[1])
        current   = sum(
            int(kw.monthly_volume * self._ctr(kw.our_estimated_rank))
            for kw in keywords
        )
        monthly_loss = max(0, max_reach - current)
        cov_score    = round(covered / len(keywords) * 100, 1) if keywords else 0
        ai_kws       = [kw for kw in keywords if kw.is_ai_query]
        ai_covered   = sum(1 for g in gaps
                           if g.keyword.is_ai_query and g.covered_by_us)
        aio_score    = round(ai_covered / len(ai_kws) * 100, 1) if ai_kws else 0
        overall      = round(
            cov_score * 0.5 + aio_score * 0.3 +
            min(current / max(max_reach, 1) * 100, 100) * 0.2, 1
        )
        top_opps = [g for g in gaps if not g.covered_by_us][:self.top_opportunity_limit]
        return TrafficLossScore(
            total_keywords=len(keywords),
            covered_keywords=covered,
            missing_keywords=len(gaps) - covered,
            total_monthly_volume=total_vol,
            estimated_reachable_volume=max_reach,
            current_estimated_traffic=current,
            monthly_traffic_loss=monthly_loss,
            annual_traffic_loss=monthly_loss * 12,
            coverage_score=cov_score,
            aio_score=aio_score,
            overall_score=overall,
            top_opportunity_keywords=top_opps,
        )


# ══════════════════════════════════════════════════════════════
# SEOReportGenerator — Markdown + JSON レポート生成
# ══════════════════════════════════════════════════════════════

class SEOReportGenerator:

    def __init__(self, config: dict):
        cfg = config.get("seo_competitor", {})
        self.output_dir = Path(cfg.get("report_dir", "data/seo_reports"))
        self.site_url   = config.get("site", {}).get("url", "")

    @staticmethod
    def _tbl(headers: list[str], rows: list[list]) -> str:
        h = "| " + " | ".join(headers) + " |"
        d = "| " + " | ".join(["---"] * len(headers)) + " |"
        r = "\n".join("| " + " | ".join(str(c) for c in row) + " |"
                       for row in rows)
        return "\n".join([h, d, r])

    def build_markdown(self, report: SEOCompetitorReport) -> str:
        tl = report.traffic_loss
        lines = [
            "# SEO競合調査レポート",
            f"> 生成: {report.generated_at}  |  対象: {report.site_url}",
            "",
            "---",
            "## 1. トラフィック損失スコアサマリー",
            "```",
            f"総合スコア:               {tl.overall_score:>6.1f} / 100",
            f"キーワードカバレッジ:     {tl.coverage_score:>6.1f}%"
            f"  ({tl.covered_keywords}/{tl.total_keywords} KW)",
            f"AI検索クエリカバレッジ:   {tl.aio_score:>6.1f}%",
            f"月間アクセス損失 (推定):  -{tl.monthly_traffic_loss:>8,} UU/月",
            f"年間アクセス損失 (推定):  -{tl.annual_traffic_loss:>8,} UU/年",
            f"現在の推定流入:           {tl.current_estimated_traffic:>8,} UU/月",
            f"最大到達可能流入:         {tl.estimated_reachable_volume:>8,} UU/月",
            "```",
            "",
        ]

        # 発見競合
        if report.discovered_competitors:
            lines += [
                "## 2. SERP発見競合サイト（リアルタイム調査）",
                "",
                self._tbl(
                    ["スコア", "ドメイン", "会社名推定", "登場KW数",
                     "平均順位", "最良順位", "登場キーワード（抜粋）"],
                    [
                        [
                            f"{c.discovery_score:.2f}",
                            c.domain,
                            c.name,
                            c.appearances,
                            f"{c.avg_position:.1f}位",
                            f"{c.best_position}位",
                            "/ ".join(c.keywords_found[:2]),
                        ]
                        for c in report.discovered_competitors
                    ],
                ),
                "",
            ]

        # 機会キーワード
        lines += [
            "## 3. 上位機会キーワード（即対応推奨）",
            "",
            self._tbl(
                ["順位", "キーワード", "Vol/月", "難易度",
                 "機会スコア", "損失UU/月", "競合対応数"],
                [
                    [
                        i + 1, g.keyword.keyword,
                        f"{g.keyword.monthly_volume:,}",
                        g.keyword.difficulty,
                        f"{g.opportunity_score:.1f}",
                        f"-{g.traffic_loss_monthly:,}",
                        len(g.covered_by_competitors),
                    ]
                    for i, g in enumerate(tl.top_opportunity_keywords)
                ],
            ),
            "",
        ]

        # カテゴリ別
        cats: dict[str, dict] = {}
        cat_labels = {
            "seo": "SEO・コンテンツマーケ", "aio": "AIO・LLMO",
            "dx": "DX・AIコンサル",         "web": "Web開発",
            "price": "価格比較クエリ",       "ai_query": "AI検索ロングテール",
        }
        for g in report.keyword_gaps:
            c = g.keyword.category
            if c not in cats:
                cats[c] = {"total": 0, "covered": 0, "loss": 0}
            cats[c]["total"]   += 1
            cats[c]["covered"] += 1 if g.covered_by_us else 0
            cats[c]["loss"]    += g.traffic_loss_monthly

        lines += [
            "## 4. カテゴリ別キーワードカバレッジ",
            "",
            self._tbl(
                ["カテゴリ", "カバー数/総数", "カバー率", "月間損失UU"],
                [
                    [
                        cat_labels.get(cat, cat),
                        f"{v['covered']}/{v['total']}",
                        f"{round(v['covered']/v['total']*100)}%",
                        f"-{v['loss']:,}",
                    ]
                    for cat, v in cats.items()
                ],
            ),
            "",
        ]

        # 競合比較
        if report.competitor_comparisons:
            lines += [
                "## 5. 競合サイト詳細比較",
                "",
                self._tbl(
                    ["競合名", "発見方法", "KWカバー率", "AIO対応",
                     "価格透明性", "コンテンツ量"],
                    [
                        [
                            c.competitor.name,
                            "SERP自動発見" if c.competitor.is_discovered else "プリセット",
                            f"{c.keyword_coverage_pct:.1f}%",
                            f"{c.aio_readiness_score}/100",
                            "◯" if c.has_price_page else "✕",
                            f"{c.page_data.word_count:,}words",
                        ]
                        for c in report.competitor_comparisons
                    ],
                ),
                "",
            ]
            for c in report.competitor_comparisons:
                src = "（SERP自動発見）" if c.competitor.is_discovered else ""
                lines += [
                    f"### {c.competitor.name}{src}",
                    f"- URL: {c.competitor.url}",
                    f"- **強み:** {' / '.join(c.strengths) or 'なし'}",
                    f"- **弱み:** {' / '.join(c.weaknesses) or 'なし'}",
                    f"- {c.competitor.notes}",
                    "",
                ]

        # 改善提案
        lines += ["## 6. 改善提案（優先度順）", ""]
        for i, rec in enumerate(report.recommendations, 1):
            lines.append(f"{i}. {rec}")
        lines.append("")

        # AI検索クエリ
        ai_gaps = [g for g in report.keyword_gaps if g.keyword.is_ai_query]
        if ai_gaps:
            lines += [
                "## 7. AI検索向けクエリ対応状況",
                "",
            ]
            for g in ai_gaps:
                status = "◯ 対応済" if g.covered_by_us else "✕ 未対応"
                lines.append(
                    f"- `{g.keyword.keyword}` — {status}"
                    f"（月間{g.keyword.monthly_volume}クエリ推定）"
                )
            lines.append("")

        return "\n".join(lines)

    def generate_recommendations(
        self,
        gaps: list[KeywordGap],
        comparisons: list[CompetitorComparison],
        traffic_loss: TrafficLossScore,
        discovered: list[DiscoveredCompetitor],
    ) -> list[str]:
        recs = []
        cat_labels = {
            "seo": "SEO・コンテンツマーケ", "aio": "AIO・LLMO",
            "dx": "DX・AIコンサル", "web": "Web開発",
            "price": "価格比較", "ai_query": "AI検索向けクエリ",
        }
        # カテゴリ別損失ランキング
        cat_losses: dict[str, int] = {}
        for g in gaps:
            if not g.covered_by_us:
                cat_losses[g.keyword.category] = \
                    cat_losses.get(g.keyword.category, 0) + g.traffic_loss_monthly
        if cat_losses:
            top_cat, top_loss = max(cat_losses.items(), key=lambda x: x[1])
            recs.append(
                f"【最優先/月間{top_loss:,}UU損失】"
                f"{cat_labels.get(top_cat, top_cat)}カテゴリのページ強化"
                " → 該当キーワードのランディングページ新設・既存ページへの追記"
            )
        # AIO対応
        if traffic_loss.aio_score < 30:
            recs.append(
                f"【AIO強化/現在{traffic_loss.aio_score:.0f}%】"
                "llms.txtにFAQ定義文追加 + 全サービスページにFAQPageスキーマ実装"
            )
        # 発見競合への対抗策
        if discovered:
            top_rival = discovered[0]
            recs.append(
                f"【競合対策】「{top_rival.domain}」が最重要競合"
                f"（スコア{top_rival.discovery_score:.1f}, "
                f"{top_rival.appearances}KWに登場）"
                " → 同ドメインが対応しているキーワードを優先的に攻略"
            )
        # 価格透明性
        non_transparent = sum(1 for c in comparisons if not c.has_price_page)
        if non_transparent >= len(comparisons) // 2:
            recs.append(
                f"【差別化】競合{non_transparent}社が価格非公開"
                " → ¥98,000/月の価格透明性をFVで強調（比較検索での優位性）"
            )
        # 機会キーワードTOP3
        for g in [g for g in gaps if not g.covered_by_us][:3]:
            rival_str = "・".join(g.covered_by_competitors[:2]) or "競合なし（先行獲得可能）"
            recs.append(
                f"「{g.keyword.keyword}」(月間{g.keyword.monthly_volume:,}検索)"
                f" — {rival_str}が対応済"
                f" → ページ新設で月間{g.traffic_loss_monthly:,}UU獲得可能"
            )
        # 定番改善
        recs.append(
            "【PR/引用獲得】PR TIMES配信 + アスピック・ミツモア等への登録"
            " → AI学習データへの組み込みを促進"
        )
        recs.append(
            "【法務】特商法(/tokushoho.html)・プライバシーポリシー完備"
            " → E-E-A-T向上・Google信頼性評価に直結"
        )
        return recs

    def save(self, report: SEOCompetitorReport) -> tuple[Path, Path]:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(JST).strftime("%Y%m%d_%H%M%S")

        # JSON
        json_path = self.output_dir / f"seo_report_{ts}.json"
        obj = {
            "generated_at": report.generated_at,
            "site_url":     report.site_url,
            "traffic_loss": {
                k: v for k, v in report.traffic_loss.__dict__.items()
                if k != "top_opportunity_keywords"
            },
            "top_opportunity_keywords": [
                {"keyword": g.keyword.keyword,
                 "monthly_volume": g.keyword.monthly_volume,
                 "traffic_loss_monthly": g.traffic_loss_monthly,
                 "opportunity_score": g.opportunity_score,
                 "covered_by_competitors": g.covered_by_competitors}
                for g in report.traffic_loss.top_opportunity_keywords
            ],
            "discovered_competitors": [
                {"domain": d.domain, "name": d.name,
                 "discovery_score": d.discovery_score,
                 "appearances": d.appearances,
                 "avg_position": d.avg_position,
                 "keywords_found": d.keywords_found}
                for d in report.discovered_competitors
            ],
            "competitor_comparisons": [
                {"name": c.competitor.name,
                 "url": c.competitor.url,
                 "is_discovered": c.competitor.is_discovered,
                 "keyword_coverage_pct": c.keyword_coverage_pct,
                 "aio_readiness_score": c.aio_readiness_score,
                 "has_price_page": c.has_price_page,
                 "strengths": c.strengths,
                 "weaknesses": c.weaknesses}
                for c in report.competitor_comparisons
            ],
            "keyword_gaps_top20": [
                {"keyword": g.keyword.keyword,
                 "category": g.keyword.category,
                 "monthly_volume": g.keyword.monthly_volume,
                 "covered_by_us": g.covered_by_us,
                 "covered_by_competitors": g.covered_by_competitors,
                 "traffic_loss_monthly": g.traffic_loss_monthly,
                 "opportunity_score": g.opportunity_score}
                for g in report.keyword_gaps[:20]
            ],
            "recommendations": report.recommendations,
        }
        json_path.write_text(
            json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

        # Markdown
        md_path = self.output_dir / f"seo_report_{ts}.md"
        md_path.write_text(report.markdown_report, encoding="utf-8")

        # latest エイリアス
        for src, dst in [
            (json_path, self.output_dir / "latest_seo_report.json"),
            (md_path,   self.output_dir / "latest_seo_report.md"),
        ]:
            dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")

        logger.info(f"SEOレポート保存: {md_path}")
        return json_path, md_path


# ══════════════════════════════════════════════════════════════
# SEOCompetitorEngine — メインオーケストレーター
# ══════════════════════════════════════════════════════════════

class SEOCompetitorEngine:
    """
    SEO競合調査の全工程を統括するエンジン。

    処理フロー:
      1. キーワードカタログ構築
      2. CompetitorDiscovery: DuckDuckGo SERPから競合を自動発見
      3. CompetitorScraper: 発見競合ページをスクレイピング
      4. SEOCompetitorAnalyzer: ギャップ分析 + 損失スコアリング
      5. SEOReportGenerator: レポート生成・保存
    """

    def __init__(self, config: dict):
        self.config    = config
        cfg            = config.get("seo_competitor", {})
        self.discovery = CompetitorDiscovery(config)
        self.scraper   = CompetitorScraper(config)
        self.analyzer  = SEOCompetitorAnalyzer(config)
        self.reporter  = SEOReportGenerator(config)
        self.site_url  = config.get("site", {}).get("url", "")
        self.extra_keywords    = cfg.get("extra_keywords", [])
        self.extra_competitors = cfg.get("extra_competitors", [])

    def run(self, dry_run: bool = False) -> SEOCompetitorReport:
        logger.info("════ SEO競合調査エンジン v2.0 開始 ════")

        # Step 1: キーワードカタログ
        logger.info("[1/5] キーワードカタログ構築")
        keywords = build_keyword_catalog(self.extra_keywords)
        logger.info(f"      {len(keywords)}キーワード定義済み")

        # Step 2: SERP競合発見
        logger.info("[2/5] DuckDuckGo SERPから競合を自動発見")
        discovered = self.discovery.discover(keywords)
        competitors = self.discovery.to_competitor_defs(discovered)

        # config で追加された固定競合をマージ（重複除外）
        discovered_domains = {c.url.split("/")[2].lstrip("www.")
                              for c in competitors}
        for extra in self.extra_competitors:
            d = extra.get("url", "").split("/")[2].lstrip("www.")
            if d not in discovered_domains:
                competitors.append(CompetitorDef(**extra))

        logger.info(f"      競合{len(competitors)}件（発見:{len(discovered)}件）")

        # Step 3: 競合ページスクレイピング
        logger.info("[3/5] 競合ページスクレイピング")
        pages = self.scraper.scrape_all(competitors)
        ok    = sum(1 for p in pages if p.fetched_ok)
        logger.info(f"      取得成功: {ok}/{len(pages)}件")

        # Step 4: ギャップ分析・スコアリング
        logger.info("[4/5] ギャップ分析 + トラフィック損失スコアリング")
        gaps         = self.analyzer.analyze_gaps(keywords, pages)
        comparisons  = self.analyzer.build_competitor_comparisons(
            competitors, pages, keywords)
        traffic_loss = self.analyzer.score_traffic_loss(keywords, gaps)
        logger.info(
            f"      総合スコア: {traffic_loss.overall_score:.1f}/100"
            f" | 月間損失: -{traffic_loss.monthly_traffic_loss:,} UU"
        )

        # Step 5: レポート生成
        logger.info("[5/5] レポート生成")
        recommendations = self.reporter.generate_recommendations(
            gaps, comparisons, traffic_loss, discovered)
        report = SEOCompetitorReport(
            generated_at=datetime.now(JST).isoformat(),
            site_url=self.site_url,
            traffic_loss=traffic_loss,
            competitor_comparisons=comparisons,
            keyword_gaps=gaps,
            recommendations=recommendations,
            discovered_competitors=discovered,
        )
        report.markdown_report = self.reporter.build_markdown(report)

        if dry_run:
            logger.info("[DRY RUN] ファイル保存スキップ")
            print("\n" + "=" * 70)
            print(report.markdown_report)
            print("=" * 70)
        else:
            json_path, md_path = self.reporter.save(report)
            logger.info(f"✅ 完了: {md_path}")

        return report


# ──────────────────────────────────────────────
# ビルドヘルパー（__init__.py 経由でエクスポート）
# ──────────────────────────────────────────────

def build_competitor_catalog(extra: list[dict] = None) -> list[CompetitorDef]:
    """後方互換: 空リストを返す（発見はSERPから行う）"""
    defs = []
    if extra:
        for e in extra:
            defs.append(CompetitorDef(**e))
    return defs
