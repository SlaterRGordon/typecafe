import { type NextPage } from "next";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Modal } from "~/components/Modal";
import { Edit } from "~/components/profile/edit/Edit";
import { ProfileView } from "~/components/profile/ProfileView";
import { api } from "~/utils/api";
import { ConfirmModal } from "~/components/ConfirmModal";

const Profile: NextPage = () => {
  const router = useRouter()
  const { status } = useSession();
  const [deleting, setDeleting] = useState(false)

  const { data: userData, refetch: refetchUserData, isLoading } = api.user.get.useQuery()

  const onModalClose = async () => {
    const input = document.getElementById("configModal") as HTMLInputElement
    if (input) input.checked = false
    await refetchUserData()
  }

  const onConfirmModalClose = () => {
    const input = document.getElementById("confirmModal") as HTMLInputElement
    if (input) input.checked = !input.checked
  }

  // delete user
  const deleteUser = api.user.delete.useMutation({
    onSuccess: () => {
      setDeleting(false)
      void signOut()
      void router.push("/")
    },
    onError: (error) => {
      console.log(error)
      setDeleting(false)
    }
  })

  const deleteProfile = (result: boolean) => {
    if (result) {
      setDeleting(true)
      deleteUser.mutate()
    } else {
      setDeleting(false)
    }
    onConfirmModalClose()
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/")
        .catch(err => console.log(err))
    }
  }, [status, router])

  if (status === "loading") return <div className="loading-spinner"></div>;
  else if (status === "unauthenticated") return <div className="loading-spinner"></div>;

  return (
    <>
      <div className="flex h-full w-full flex-col overflow-auto overflow-x-hidden">
        <ProfileView user={userData} isLoading={isLoading} editable />
      </div>
      <Modal boxClassName="sm:w-[500px] !max-h-[82vh] sm:!max-h-[calc(100vh-5em)]">
        <Edit userData={userData} onClose={onModalClose} openConfirmModal={onConfirmModalClose} />
      </Modal>
      <ConfirmModal loading={deleting} message="Are you sure you want to delete your account?" callback={(result) => deleteProfile(result)} />
    </>
  );
};

export default Profile;
