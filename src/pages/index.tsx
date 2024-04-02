import { type NextPage } from "next";
import { useState } from "react";
import { Modal } from "~/components/Modal";
import { Typer } from "~/components/typer/Typer";
import { Config } from "~/components/typer/config/Config";
import { TestGramSources, TestModes, TestSubModes } from "~/components/typer/types";

const Home: NextPage = () => {
  const [showStats, setShowStats] = useState(true)
  const [language, setLanguage] = useState("english" as string)
  const [mode, setMode] = useState<TestModes>(TestModes.normal)
  const [subMode, setSubMode] = useState<TestSubModes>(TestSubModes.timed)
  const [gramSource, setGramSource] = useState<TestGramSources>(TestGramSources.bigrams)
  const [gramCombination, setGramCombination] = useState<number>(1)
  const [gramRepetition, setGramRepetition] = useState<number>(1)
  const [count, setCount] = useState(15)

  return (
    <>
      <div id="typer" className="flex md:w-10/12 h-full justify-center">
        <Typer
          language={language}
          mode={mode}
          subMode={subMode}
          gramSource={gramSource}
          gramCombination={gramCombination}
          gramRepetition={gramRepetition}
          count={count}
          showStats={showStats}
          showConfig={true}
        />
      </div>
      <Modal>
        <Config
          language={language} setLanguage={setLanguage}
          mode={mode} setMode={setMode}
          subMode={subMode} setSubMode={setSubMode}
          gramSource={gramSource} setGramSource={setGramSource}
          gramCombination={gramCombination} setGramCombination={setGramCombination}
          gramRepetition={gramRepetition} setGramRepetition={setGramRepetition}
          count={count} setCount={setCount}
          showStats={showStats} setShowStats={setShowStats}
        />
      </Modal>
    </>
  );
};

export default Home;
