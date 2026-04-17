importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAnIB-z-tNS_lnewOYyzevSPeVV8xAEbNw",
  authDomain: "gen-lang-client-0684255527.firebaseapp.com",
  projectId: "gen-lang-client-0684255527",
  storageBucket: "gen-lang-client-0684255527.firebasestorage.app",
  messagingSenderId: "1088373025539",
  appId: "1:1088373025539:web:dac76628753d69cce39736"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
