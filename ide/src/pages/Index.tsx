import dynamic from "next/dynamic";

const LegacyIndexPage = dynamic(() => import("@/features/ide/Index"), {
  ssr: false,
});

export default LegacyIndexPage;
