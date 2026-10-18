import { RootShell, siteMetadata, viewport } from "../shell";
import "../globals.css";

export const metadata = siteMetadata("zh");
export { viewport };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RootShell locale="zh">{children}</RootShell>;
}
