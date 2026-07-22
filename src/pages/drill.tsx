import type { GetServerSideProps, NextPage } from "next"
import { drillCompatibilityDestination } from "~/lib/drillCompatibility"

const DrillCompatibilityRedirect: NextPage = () => null

export const getServerSideProps: GetServerSideProps = ({ query }) => Promise.resolve({
    redirect: {
        destination: drillCompatibilityDestination(query),
        permanent: false,
    },
})

export default DrillCompatibilityRedirect
