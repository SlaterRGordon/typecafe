import Head from "next/head";

interface GuideQuestion {
  question: string;
  answer: string;
}

interface GuideSeoProps {
  title: string;
  description: string;
  headline: string;
  path: string;
  questions: GuideQuestion[];
}

export const GuideSeo = ({ title, description, headline, path, questions }: GuideSeoProps) => {
  const url = `https://typecafe.app${path}`;
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    author: { "@type": "Organization", name: "TypeCafe", url: "https://typecafe.app" },
    publisher: { "@type": "Organization", name: "TypeCafe", url: "https://typecafe.app" },
    datePublished: "2026-07-12",
    dateModified: "2026-07-12",
    mainEntityOfPage: url,
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Guides", item: "https://typecafe.app/guides" },
      { "@type": "ListItem", position: 2, name: headline, item: url },
    ],
  };

  return (
    <Head>
      <title>{title}</title>
      <meta key="description" name="description" content={description} />
      <meta key="og:type" property="og:type" content="article" />
      <meta key="og:title" property="og:title" content={title} />
      <meta key="og:description" property="og:description" content={description} />
      <meta key="twitter:title" name="twitter:title" content={title} />
      <meta key="twitter:description" name="twitter:description" content={description} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    </Head>
  );
};
