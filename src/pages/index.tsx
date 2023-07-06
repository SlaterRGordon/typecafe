import { type NextPage } from "next";
import { useState } from "react";
import { Modal } from "~/components/Modal";
import { Typer } from "~/components/typer/Typer";
import { Config } from "~/components/typer/config/Config";
import { TestModes, TestSubModes } from "~/components/typer/types";

const Home: NextPage = () => {
  const [showStats, setShowStats] = useState(true)
  const [language, setLanguage] = useState("english" as string)
  const [mode, setMode] = useState<TestModes>(TestModes.normal)
  const [subMode, setSubMode] = useState<TestSubModes>(TestSubModes.timed)
  const [count, setCount] = useState(15)

  return (
    <>
      <div id="typer" className="flex w-full h-full justify-center">
        <Typer
          language={language}
          mode={mode}
          subMode={subMode}
          count={count}
          showStats={showStats}
        />
      </div>
      <Modal>
        <Config
          language={language} setLanguage={setLanguage}
          mode={mode} setMode={setMode}
          subMode={subMode} setSubMode={setSubMode}
          count={count} setCount={setCount}
          showStats={showStats} setShowStats={setShowStats}
        />
      </Modal>
    </>
  );
};

export default Home;
