import React from 'react';

/**
 * 웹 빌드용: react-native-webview 는 웹 구현이 없으므로 iframe 을 쓴다.
 * react-native-web 트리 안에서도 일반 DOM 요소는 react-dom 이 그대로 그린다.
 */
export default function ViewerFrame({ url }) {
  return (
    <iframe
      src={url}
      title="here viewer"
      style={{ flex: 1, width: '100%', height: '100%', border: 0 }}
    />
  );
}
