import { useDebugValue, useEffect, useState } from "react"

const useLocalStorage = <S>(
  key: string,
  initialState?: S | (() => S)
): [S, React.Dispatch<React.SetStateAction<S>>] => {
  const [state, setState] = useState<S>(initialState as S)
  const [hasUpdated, setHasUpdated] = useState(false)
  useDebugValue(state)

  useEffect(() => {
    const item: string | null = localStorage.getItem(key)
    if (item) {
      setState(parse(item))
    }
    setHasUpdated(true)
  }, [key])

  useEffect(() => {
    if (hasUpdated) {
      localStorage.setItem(key, JSON.stringify(state))
    }
  }, [state, initialState, key, hasUpdated])

  return [state, setState]
}

const parse = <S>(value: string): React.SetStateAction<S> => {
  try {
    return JSON.parse(value) as React.SetStateAction<S>
  } catch {
    return value as React.SetStateAction<S>
  }
}

export default useLocalStorage