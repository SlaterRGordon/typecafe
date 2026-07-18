import type { GetServerSideProps, NextPage } from "next"

// Compatibility route for old bookmarks and persisted session links. Target
// work now starts directly from Progress; there is no separate daily plan.
const LegacyPlanRedirect: NextPage = () => null

export const getServerSideProps: GetServerSideProps = () => Promise.resolve({
    redirect: { destination: "/progress", permanent: false },
})

export default LegacyPlanRedirect
