import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "AI Staff - AI Marketing Crew",
    template: "%s | AI Staff",
  },
  description: "您的专属 AI 营销员工，随时随地帮您管理品牌内容",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AI Staff",
  },
};

export default function MockMerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
