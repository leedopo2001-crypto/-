import React from 'react';
import { WebView } from 'react-native-webview';

/** 배포된 지도 뷰어를 앱 안에 그대로 띄운다 (iOS/Android). */
export default function ViewerFrame({ url }) {
  return (
    <WebView
      source={{ uri: url }}
      style={{ flex: 1 }}
      // 뷰어는 Supabase RPC 를 부르므로 JS 필수
      javaScriptEnabled
      domStorageEnabled
      // 지도 드래그와 스크롤 충돌 방지
      nestedScrollEnabled
      startInLoadingState
    />
  );
}
