import { useCallback, useEffect, useState } from "react";

const useMutationObserver = (domNodeSelector: string, observerOptions: MutationObserverInit | undefined, cb: MutationCallback) => {
  useEffect(() => {
    const targetNode = document.querySelector(domNodeSelector);

    const observer = new MutationObserver(cb);

    observer.observe(targetNode as Node, observerOptions);

    return () => {
      observer.disconnect();
    };
  }, [domNodeSelector, observerOptions, cb]);
}

const options = { attributes: true };

export const useStyle = () => {
  const [style, setStyle] = useState<string | undefined>("");

  useEffect(() => {
    setStyle(document.documentElement.style.getPropertyValue('--p'));
  }, []);

  const handler = useCallback((mutationList: MutationRecord[]) => {
    mutationList.forEach(mutation => {
      if (mutation.type !== 'attributes' || mutation.attributeName !== 'style') return;

      setStyle(document.documentElement.style.getPropertyValue('--p'));
    });
  }, []);

  useMutationObserver('html', options, handler);

  return style; // locale[lang]
};

export const useSecondaryStyle = () => {
  const [style, setStyle] = useState<string | undefined>("");

  useEffect(() => {
    setStyle(document.documentElement.style.getPropertyValue('--s'));
  }, []);

  const handler = useCallback((mutationList: MutationRecord[]) => {
    mutationList.forEach(mutation => {
      if (mutation.type !== 'attributes' || mutation.attributeName !== 'style') return;

      setStyle(document.documentElement.style.getPropertyValue('--s'));
    });
  }, []);

  useMutationObserver('html', options, handler);

  return style; // locale[lang]
};