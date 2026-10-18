import { RootShell, siteMetadata, viewport } from "../shell";
import "../globals.css";

export const metadata = siteMetadata("en");
export { viewport };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RootShell locale="en">{children}</RootShell>;
}
