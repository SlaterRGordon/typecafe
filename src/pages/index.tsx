import { type NextPage } from "next";
import { useEffect, useState } from "react";
import { Modal } from "~/components/Modal";
import { Keyboard } from "~/components/typer/Keyboard";
import { Typer } from "~/components/typer/Typer";
import { Config } from "~/components/typer/config/Config";
import { TestGramScopes, TestGramSources, TestModes, TestSubModes } from "~/components/typer/types";

const Home: NextPage = () => {
  const [modalOpen, setModalOpen] = useState(false)
  const [showStats, setShowStats] = useState(true)
  const [showKeyboard, setShowKeyboard] = useState(true)
  const [language, setLanguage] = useState("english" as string)
  const [mode, setMode] = useState<TestModes>(TestModes.normal)
  const [subMode, setSubMode] = useState<TestSubModes>(TestSubModes.timed)
  const [gramSource, setGramSource] = useState<TestGramSources>(TestGramSources.bigrams)
  const [gramScope, setGramScope] = useState<TestGramScopes>(TestGramScopes.fifty)
  const [gramCombination, setGramCombination] = useState<number>(1)
  const [gramRepetition, setGramRepetition] = useState<number>(0)
  const [count, setCount] = useState(15)
  const [currentKey, setCurrentKey] = useState("")

  
  const onKeyChange = (key: string) => {
    setCurrentKey(key)
  }

  return (
    <>
      <div id="typer" className="flex flex-col md:w-10/12 h-full justify-center">
        <Typer
          language={language}
          mode={mode}
          subMode={subMode}
          gramSource={gramSource}
          gramScope={gramScope}
          gramCombination={gramCombination}
          gramRepetition={gramRepetition}
          count={count}
          showStats={showStats}
          showConfig={true}
          modalOpen={modalOpen}
          setModalOpen={setModalOpen}
          onKeyChange={onKeyChange}
        />
        {showKeyboard && <Keyboard currentKey={currentKey} />}
      </div>
      <Modal setModalOpen={(open) => setModalOpen(open)}>
        <Config
          language={language} setLanguage={setLanguage}
          mode={mode} setMode={setMode}
          subMode={subMode} setSubMode={setSubMode}
          gramSource={gramSource} setGramSource={setGramSource}
          gramScope={gramScope} setGramScope={setGramScope}
          gramCombination={gramCombination} setGramCombination={setGramCombination}
          gramRepetition={gramRepetition} setGramRepetition={setGramRepetition}
          count={count} setCount={setCount}
          showStats={showStats} setShowStats={setShowStats}
          showKeyboard={showKeyboard} setShowKeyboard={setShowKeyboard}
        />
      </Modal>
    </>
  );
};

export default Home;
