const fs = require("fs");
const path = require("path");

const siteUrl = "https://dezhiketang.cn";
const rootDir = path.resolve(__dirname, "..");
const contentDir = path.join(rootDir, "content", "articles");
const articlesDir = path.join(rootDir, "articles");
const cssListPath = "../assets/knowledge.css";
const cssDetailPath = "../../assets/knowledge.css";
const fallbackOgImage = "assets/canada-city.jpg";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stripQuotes(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeAssetPath(assetPath) {
  if (!assetPath) return "";
  let clean = stripQuotes(assetPath).replace(/\\/g, "/");
  while (clean.startsWith("../")) clean = clean.slice(3);
  while (clean.startsWith("./")) clean = clean.slice(2);
  return clean;
}

function assetForList(assetPath) {
  const clean = normalizeAssetPath(assetPath);
  return clean ? `../${clean}` : "";
}

function assetForDetail(assetPath) {
  const clean = normalizeAssetPath(assetPath);
  return clean ? `../../${clean}` : "";
}

function assetUrl(assetPath) {
  const clean = normalizeAssetPath(assetPath || fallbackOgImage);
  return `${siteUrl}/${clean}`;
}

function parseFrontmatter(source, filePath) {
  const normalized = source.replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Missing frontmatter: ${filePath}`);
  }

  const data = { tags: [], faq: [] };
  const lines = match[1].split(/\r?\n/);
  let mode = "";
  let currentFaq = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;

    const keyMatch = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (keyMatch && !line.startsWith(" ")) {
      const key = keyMatch[1];
      const value = keyMatch[2];
      if (key === "tags") {
        data.tags = [];
        mode = "tags";
      } else if (key === "faq") {
        data.faq = [];
        mode = "faq";
      } else {
        data[key] = stripQuotes(value);
        mode = "";
      }
      continue;
    }

    if (mode === "tags") {
      const tagMatch = line.match(/^\s*[-*]\s*(.*)$/);
      if (tagMatch) data.tags.push(stripQuotes(tagMatch[1]));
      continue;
    }

    if (mode === "faq") {
      const questionMatch = line.match(/^\s*[-*]\s*question:\s*(.*)$/);
      if (questionMatch) {
        currentFaq = { question: stripQuotes(questionMatch[1]), answer: "" };
        data.faq.push(currentFaq);
        continue;
      }
      const answerMatch = line.match(/^\s*answer:\s*(.*)$/);
      if (answerMatch && currentFaq) {
        currentFaq.answer = stripQuotes(answerMatch[1]);
      }
    }
  }

  for (const required of ["title", "slug", "date", "category", "description"]) {
    if (!data[required]) throw new Error(`Missing "${required}" in ${filePath}`);
  }
  data.updated = data.updated || data.date;
  data.body = match[2].trim();
  data.sourceFile = filePath;
  return data;
}

function makeHeadingId(text, index) {
  const ascii = text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii || `section-${index}`;
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return html;
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const toc = [];
  const html = [];
  let paragraph = [];
  let listOpen = false;
  let headingIndex = 0;

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function closeList() {
    if (!listOpen) return;
    html.push("</ul>");
    listOpen = false;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      const text = heading[2].trim();
      if (level === 1) continue;
      headingIndex += 1;
      const id = makeHeadingId(text, headingIndex);
      toc.push({ level, text, id });
      html.push(`<h${level} id="${id}">${inlineMarkdown(text)}</h${level}>`);
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const quote = trimmed.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();
  return { html: html.join("\n"), toc };
}

function formatDate(date) {
  return date || "";
}

function fullUrl(pathname) {
  const clean = pathname.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${siteUrl}/${clean}`;
}

function jsonScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function buildHeader(prefixToRoot) {
  return `<header class="topbar">
  <div class="container nav">
    <a class="brand" href="${prefixToRoot}index.html">得知课堂 Avantclass<span>Knowledge Base</span></a>
    <nav class="nav-links" aria-label="主导航">
      <a href="${prefixToRoot}index.html#home">首页</a>
      <a href="${prefixToRoot}index.html#canada">加拿大本科</a>
      <a href="${prefixToRoot}index.html#uk">英国规划</a>
      <a href="${prefixToRoot}articles/index.html">知识库</a>
      <a href="${prefixToRoot}index.html#contact">咨询</a>
    </nav>
  </div>
</header>`;
}

function buildFooter(prefixToRoot) {
  return `<footer class="footer">
  <div class="container footer-grid">
    <div><strong>得知课堂 Avantclass</strong><br>加拿大本科辅导与英国本科申请规划</div>
    <a href="${prefixToRoot}index.html#contact">预约一对一规划建议</a>
  </div>
</footer>`;
}

function buildArticlePage(article, allArticles) {
  const { html, toc } = renderMarkdown(article.body);
  const url = fullUrl(`articles/${article.slug}/`);
  const imageUrl = assetUrl(article.cover);
  const related = getRelatedArticles(article, allArticles);
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    image: imageUrl,
    datePublished: article.date,
    dateModified: article.updated,
    inLanguage: "zh-CN",
    author: { "@type": "Organization", name: "得知课堂 Avantclass" },
    publisher: { "@type": "Organization", name: "得知课堂 Avantclass" },
    mainEntityOfPage: url
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "知识库", item: fullUrl("articles/") },
      { "@type": "ListItem", position: 3, name: article.category, item: fullUrl("articles/") },
      { "@type": "ListItem", position: 4, name: article.title, item: url }
    ]
  };
  const faqSchema = article.faq && article.faq.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: article.faq.map(item => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer }
    }))
  } : null;

  const tocHtml = toc.length
    ? toc.map(item => `<a class="toc-h${item.level}" href="#${item.id}">${escapeHtml(item.text)}</a>`).join("\n")
    : `<a href="#article-body">正文内容</a>`;

  const coverHtml = article.cover
    ? `<img class="cover" src="${assetForDetail(article.cover)}" alt="${escapeHtml(article.title)}封面图">`
    : "";

  const tagsHtml = (article.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const faqHtml = article.faq && article.faq.length
    ? `<section class="faq-section" id="faq"><h2>常见问题</h2>${article.faq.map(item => `<div class="faq-item"><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></div>`).join("")}</section>`
    : "";
  const relatedHtml = related.length
    ? `<section class="related"><h2>相关推荐</h2><div class="related-grid">${related.map(item => `<a class="related-card" href="../${item.slug}/"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.category)} · ${formatDate(item.updated)}</span></a>`).join("")}</div></section>`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(article.title)} - 得知课堂</title>
  <meta name="description" content="${escapeHtml(article.description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:title" content="${escapeHtml(article.title)} - 得知课堂">
  <meta property="og:description" content="${escapeHtml(article.description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${imageUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(article.title)} - 得知课堂">
  <meta name="twitter:description" content="${escapeHtml(article.description)}">
  <meta name="twitter:image" content="${imageUrl}">
  <link rel="stylesheet" href="${cssDetailPath}">
  ${jsonScript(articleSchema)}
  ${jsonScript(breadcrumbSchema)}
  ${faqSchema ? jsonScript(faqSchema) : ""}
</head>
<body>
${buildHeader("../../")}
<main>
  <section class="hero">
    <div class="container">
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="../../index.html">首页</a><span>&gt;</span>
        <a href="../index.html">知识库</a><span>&gt;</span>
        <span>${escapeHtml(article.category)}</span><span>&gt;</span>
        <span>${escapeHtml(article.title)}</span>
      </nav>
      <div class="eyebrow">${escapeHtml(article.category)}</div>
      <h1>${escapeHtml(article.title)}</h1>
      <p class="hero-desc">${escapeHtml(article.description)}</p>
      <div class="meta-row">
        <span class="pill">发布时间：${formatDate(article.date)}</span>
        <span class="pill">更新时间：${formatDate(article.updated)}</span>
        <span class="pill">分类：${escapeHtml(article.category)}</span>
      </div>
      <div class="tag-row" style="margin-top:14px">${tagsHtml}</div>
    </div>
  </section>
  <section class="knowledge-main">
    <div class="container article-layout">
      <aside class="toc" aria-label="文章目录">
        <strong>目录</strong>
        ${tocHtml}
      </aside>
      <article class="article-shell">
        ${coverHtml}
        <section class="summary-box"><h2>内容摘要</h2><p>${escapeHtml(article.description)}</p></section>
        <div class="article-content" id="article-body">
          ${html}
        </div>
        ${faqHtml}
        ${relatedHtml}
        <section class="cta">
          <h2>需要结合孩子情况做具体规划？</h2>
          <p>如果你正在准备加拿大本科选课、进专业规划、GPA提升或课程辅导，可以联系得知课堂获取一对一规划建议。</p>
          <a href="../../index.html#contact">预约咨询</a>
        </section>
      </article>
    </div>
  </section>
</main>
${buildFooter("../../")}
</body>
</html>`;
}

function getRelatedArticles(article, allArticles) {
  const others = allArticles.filter(item => item.slug !== article.slug);
  const tagSet = new Set(article.tags || []);
  return others
    .map(item => {
      let score = 0;
      if (item.category === article.category) score += 10;
      score += (item.tags || []).filter(tag => tagSet.has(tag)).length * 3;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score || String(b.item.updated).localeCompare(String(a.item.updated)))
    .slice(0, 3)
    .map(entry => entry.item);
}

function readMarkdownArticles() {
  if (!fs.existsSync(contentDir)) return [];
  return fs.readdirSync(contentDir)
    .filter(file => file.endsWith(".md"))
    .map(file => {
      const filePath = path.join(contentDir, file);
      return parseFrontmatter(fs.readFileSync(filePath, "utf8"), filePath);
    })
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

function readLegacyArticles(markdownSlugs) {
  if (!fs.existsSync(articlesDir)) return [];
  return fs.readdirSync(articlesDir)
    .filter(file => file.endsWith(".html") && file !== "index.html")
    .filter(file => !markdownSlugs.has(file.replace(/\.html$/, "")))
    .map(file => {
      const fullPath = path.join(articlesDir, file);
      const html = fs.readFileSync(fullPath, "utf8");
      const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
      const h1Match = html.match(/<h1>([\s\S]*?)<\/h1>/i);
      const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
      const stat = fs.statSync(fullPath);
      const title = stripTags(h1Match ? h1Match[1] : titleMatch ? titleMatch[1].replace(/\s*[-｜]\s*得知课堂.*$/, "") : file);
      return {
        title,
        slug: file,
        urlPath: file,
        date: stat.mtime.toISOString().slice(0, 10),
        updated: stat.mtime.toISOString().slice(0, 10),
        category: "历史文章",
        tags: ["留学知识库"],
        description: descMatch ? descMatch[1] : "得知课堂留学知识库历史文章。",
        legacy: true
      };
    });
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, "").trim();
}

function buildListPage(markdownArticles, legacyArticles) {
  const allCards = [...markdownArticles.map(item => ({ ...item, href: `${item.slug}/` })), ...legacyArticles.map(item => ({ ...item, href: item.urlPath }))];
  const cardsHtml = allCards.map(article => {
    const tags = (article.tags || []).slice(0, 5).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    return `<article class="article-card">
      <div class="card-meta"><span>${escapeHtml(article.category)}</span><span>发布时间：${formatDate(article.date)}</span><span>更新：${formatDate(article.updated)}</span></div>
      <h2><a href="${article.href}">${escapeHtml(article.title)}</a></h2>
      <p>${escapeHtml(article.description)}</p>
      <div class="tag-row">${tags}</div>
      <a class="read-more" href="${article.href}">阅读全文</a>
    </article>`;
  }).join("\n");

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "得知课堂知识库",
    description: "围绕加拿大本科、英国本科申请、新生规划、课程辅导、GPA提升、进专业规划等主题，持续更新长篇干货内容。",
    url: fullUrl("articles/")
  };

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>得知课堂知识库 - 加拿大本科与英国本科申请干货文章</title>
  <meta name="description" content="围绕加拿大本科、英国本科申请、新生规划、课程辅导、GPA提升、进专业规划等主题，持续更新长篇干货内容。">
  <link rel="canonical" href="${fullUrl("articles/")}">
  <meta property="og:title" content="得知课堂知识库">
  <meta property="og:description" content="加拿大本科、英国本科申请、新生规划、课程辅导、GPA提升、进专业规划等主题文章。">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${fullUrl("articles/")}">
  <meta property="og:image" content="${assetUrl(fallbackOgImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="得知课堂知识库">
  <meta name="twitter:description" content="持续更新加拿大本科与英国本科申请干货内容。">
  <meta name="twitter:image" content="${assetUrl(fallbackOgImage)}">
  <link rel="stylesheet" href="${cssListPath}">
  ${jsonScript(listSchema)}
</head>
<body>
${buildHeader("../")}
<main>
  <section class="hero">
    <div class="container">
      <div class="eyebrow">Knowledge Base</div>
      <h1>得知课堂知识库</h1>
      <p class="hero-desc">围绕加拿大本科、英国本科申请、新生规划、课程辅导、GPA提升、进专业规划等主题，持续更新长篇干货内容。</p>
    </div>
  </section>
  <section class="knowledge-main">
    <div class="container">
      <div class="article-list">
        ${cardsHtml}
      </div>
    </div>
  </section>
</main>
${buildFooter("../")}
</body>
</html>`;
}

function buildSitemap(markdownArticles, legacyArticles) {
  const urls = [
    { loc: siteUrl, lastmod: new Date().toISOString().slice(0, 10) },
    { loc: fullUrl("articles/"), lastmod: new Date().toISOString().slice(0, 10) },
    ...markdownArticles.map(article => ({ loc: fullUrl(`articles/${article.slug}/`), lastmod: article.updated })),
    ...legacyArticles.map(article => ({ loc: fullUrl(`articles/${article.urlPath}`), lastmod: article.updated }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(item => `  <url>
    <loc>${escapeXml(item.loc)}</loc>
    <lastmod>${escapeXml(item.lastmod)}</lastmod>
  </url>`).join("\n")}
</urlset>
`;
}

function buildRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
}

function writeGeneratedArticles(markdownArticles) {
  for (const article of markdownArticles) {
    const outDir = path.join(articlesDir, article.slug);
    ensureDir(outDir);
    fs.writeFileSync(path.join(outDir, "index.html"), buildArticlePage(article, markdownArticles), "utf8");
  }
}

function main() {
  ensureDir(contentDir);
  ensureDir(articlesDir);

  const markdownArticles = readMarkdownArticles();
  const markdownSlugs = new Set(markdownArticles.map(article => article.slug));
  const legacyArticles = readLegacyArticles(markdownSlugs);

  writeGeneratedArticles(markdownArticles);
  fs.writeFileSync(path.join(articlesDir, "index.html"), buildListPage(markdownArticles, legacyArticles), "utf8");
  fs.writeFileSync(path.join(rootDir, "sitemap.xml"), buildSitemap(markdownArticles, legacyArticles), "utf8");

  fs.writeFileSync(path.join(rootDir, "robots.txt"), buildRobots(), "utf8");

  console.log(`Built ${markdownArticles.length} markdown articles.`);
  console.log(`Included ${legacyArticles.length} legacy article pages in articles/index.html and sitemap.xml.`);
  console.log(`siteUrl: ${siteUrl}`);
}

main();
