/* eslint-disable */
// ============================================================================
// patch_i18n.cjs - Traduction de l'espace ELEVE (correctif sur les vrais fichiers)
//
//   node patch_i18n.cjs            -> SIMULATION : rien n'est modifie
//   node patch_i18n.cjs --apply    -> applique (apres sauvegarde automatique)
//
// Garde-fous : chaque remplacement doit trouver le texte EXACT attendu, le bon
// nombre de fois, sinon rien n'est ecrit. Le JS est verifie syntaxiquement
// avant ecriture, et chaque cle de traduction utilisee est verifiee dans les
// 4 langues. Relancer le script est sans danger (deja applique = ignore).
// ============================================================================
const fs = require("fs");
const path = require("path");
const os = require("os");
const cp = require("child_process");

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();
const PUB = path.join(ROOT, "public");

const ELEVE_DASHBOARD_JS = [
{"old": "updateCallStatus('Appel en cours...');", "neu": "updateCallStatus(t(\"tdbProf.appelEnCours\", \"Appel en cours...\"));", "count": 1, "optional": false},
{"old": "updateCallStatus('Appel entrant...');", "neu": "updateCallStatus(t(\"tdbEleve.appelEntrant\", \"Appel entrant...\"));", "count": 1, "optional": false},
{"old": "updateCallStatus('En communication')", "neu": "updateCallStatus(t(\"tdbProf.enCommunication\", \"En communication\"))", "count": 2, "optional": false},
{"old": "cleanupSession('Session terminée');", "neu": "cleanupSession(t(\"tdbEleve.sessionTerminee\", \"Session terminée\"));", "count": 1, "optional": false},
{"old": "cleanupSession(\"Le professeur n'a pas répondu\");", "neu": "cleanupSession(t(\"tdbEleve.profNaPasRepondu\", \"Le professeur n'a pas répondu\"));", "count": 1, "optional": false},
{"old": "cleanupSession(\"Appel refusé\");", "neu": "cleanupSession(t(\"appel.refuseTitre\", \"Appel refusé\"));", "count": 1, "optional": false},
{"old": "Le fichier \"${doc.fileName ?? doc.name}\" a été envoyé avec succès", "neu": "${t(\"tdbEleve.fichierEnvoye\", \"Le fichier \\\"{nom}\\\" a été envoyé avec succès\").replace(\"{nom}\", () => doc.fileName ?? doc.name)}", "count": 1, "optional": false},
{"old": "isFavorite ? \"Retirer des favoris\" : \"Ajouter aux favoris\"", "neu": "isFavorite ? t(\"profs.retirerFavoris\", \"Retirer des favoris\") : t(\"profs.ajouterFavoris\", \"Ajouter aux favoris\")", "count": 1, "optional": false}
];
const ELEVE_SOCKET_JS = [
{"old": "remoteProfEl.textContent = data.profName || \"Professeur\";", "neu": "remoteProfEl.textContent = data.profName || t(\"cours.professeur\", \"Professeur\");", "count": 1, "optional": false},
{"old": "`${data.userName || \"Le professeur\"} s'est déconnecté — reconnexion possible sous ${graceSeconds}s.`", "neu": "t(\"tdbEleve.profDeconnecteMessage\", \"{prof} s'est déconnecté — reconnexion possible sous {s}s.\").replace(\"{prof}\", () => data.userName || t(\"tdbEleve.leprofDefaut\", \"Le professeur\")).replace(\"{s}\", () => graceSeconds)", "count": 1, "optional": false},
{"old": "En attente du retour du professeur (${graceSeconds}s)...", "neu": "${t(\"tdbEleve.enAttenteRetourProf\", \"En attente du retour du professeur ({s}s)...\").replace(\"{s}\", () => graceSeconds)}", "count": 1, "optional": false},
{"old": "`${data.userName || \"Le professeur\"} est de retour.`", "neu": "t(\"tdbEleve.profDeRetourMessage\", \"{prof} est de retour.\").replace(\"{prof}\", () => data.userName || t(\"tdbEleve.leprofDefaut\", \"Le professeur\"))", "count": 1, "optional": false},
{"old": "if (el) el.textContent = \"En communication\";", "neu": "if (el) el.textContent = t(\"tdbProf.enCommunication\", \"En communication\");", "count": 1, "optional": false},
{"old": "btn.title = \"Partager l'écran\";", "neu": "btn.title = t(\"cours.partagerEcran\", \"Partager l'écran\");", "count": 1, "optional": false},
{"old": "<strong>Session non facturée</strong><br>", "neu": "<strong>${t(\"tdbProf.sessionNonFactureeTitre\", \"Session non facturée\")}</strong><br>", "count": 1, "optional": false},
{"old": "Durée : ${data.dureeMinutes} min — trop courte pour être facturée.", "neu": "${t(\"tdbProf.sessionNonFactureeMessage\", \"Cette session de {d} min était trop courte pour être facturée.\").replace(\"{d}\", () => data.dureeMinutes)}", "count": 1, "optional": false},
{"old": "<strong>Validation bancaire requise</strong><br>", "neu": "<strong>${t(\"tdbEleve.validationBancaireTitre\", \"Validation bancaire requise\")}</strong><br>", "count": 1, "optional": false},
{"old": "${data.message || \"Votre banque doit valider ce paiement.\"}", "neu": "${data.message || t(\"tdbEleve.validationBancaireMessageDefaut\", \"Votre banque doit valider ce paiement.\")}", "count": 1, "optional": false},
{"old": "Valider mon paiement", "neu": "${t(\"tdbEleve.validerPaiementBtn\", \"Valider mon paiement\")}", "count": 1, "optional": false}
];
const ELEVE_HTML = [
{"old": "<button id=\"enable-notifications-btn\" class=\"btn btn--primary btn--sm\" style=\"display:none; margin-left:8px;\">", "neu": "<button id=\"enable-notifications-btn\" class=\"btn btn--primary btn--sm\" style=\"display:none; margin-left:8px;\" data-i18n=\"tdbProf.activerNotifications\">", "count": 1, "optional": true},
{"old": "<span><strong>Note Apple :</strong> L'icône rouge dans la barre d'état indique uniquement que la caméra est active pour le cours en direct. Aucun enregistrement n'est effectué.</span>", "neu": "<span><strong data-i18n=\"tdbProf.notePlateformeTitre\">Note Apple :</strong> <span data-i18n=\"tdbProf.notePlateformeTexte\">L'icône rouge dans la barre d'état indique uniquement que la caméra est active pour le cours en direct. Aucun enregistrement n'est effectué.</span></span>", "count": 1, "optional": true}
];
const LOCALE_ADD = {
"fr": {"tdbProf": {"dispoLabel": "Disponible pour les appels :", "activerNotifications": "🔔 Activer les notifications", "terminer": "✕ Terminer", "vous": "Vous", "eleveLabel": "Élève", "notePlateformeTitre": "Note Apple :", "notePlateformeTexte": "L'icône rouge dans la barre d'état indique uniquement que la caméra est active pour le cours en direct. Aucun enregistrement n'est effectué.", "tableauBlanc": "✏️ Tableau blanc", "effacer": "Effacer", "quitterPleinEcran": "❌ Quitter", "quitterPleinEcranTitre": "Quitter le plein écran", "envoyer": "Envoyer", "appelsEntrantsTitre": "📞 Appels entrants", "aucunAppelEnCours": "Aucun appel en cours", "appelDunEleve": "Appel d'un élève…", "accepter": "✅ Accepter", "refuser": "✕ Refuser", "stripeConnectTitre": "💳 Stripe Connect (Vendeur)", "stripeNecessaire": "Nécessaire pour recevoir vos paiements.", "stripeConnecterBtn": "Connecter mon compte Stripe", "gainsTitre": "Gains en attente de virement", "gainsModalTitre": "💶 Mes gains", "gainsEnAttente": "en attente de virement bancaire", "gainsDejaVerse": "Déjà versé : ", "fermer": "Fermer", "appelEnCours": "Appel en cours...", "enCommunication": "En communication", "monCompte": "Mon compte", "utilisateurLabel": "Utilisateur : ", "statutLabel": "Statut : ", "abonne": "✅ Abonné", "nonAbonne": "❌ Non abonné", "configurerStripe": "⚙️ Configurer mon compte Stripe", "enregistrerCarte": "💳 Enregistrer ma carte bancaire", "erreurOuvertureStripe": "Impossible d'ouvrir la session Stripe.", "erreurLienStripe": "Impossible de générer le lien Stripe.", "erreurReseauStripe": "Une erreur réseau est survenue.", "stripeDejaConnecte": "Votre compte Stripe est déjà connecté ou une erreur est survenue.", "erreurDemarrageStripe": "Impossible de démarrer l'onboarding Stripe.", "erreurDispo": "Impossible de changer votre disponibilité pour le moment.", "activerNotifsPourDispo": "Active les notifications pour pouvoir être disponible.", "erreurPrefixe": "Erreur : ", "installTitre": "📲 Installez l'application", "installTexteAndroid": "Pour recevoir les appels même app fermée, ajoutez cette page à votre écran d'accueil.", "installTexteIOS": "Pour recevoir les appels même app fermée : appuyez sur <strong>Partager</strong> ⬆️ puis <strong>« Sur l'écran d'accueil »</strong>.", "installBtn": "Installer", "installPlusTard": "Plus tard", "installCompris": "Compris", "activerSon": "🔔 Activer le son des appels", "deconnexionBtn": "🚪 Déconnexion", "notifPaiementDefaut": "Paiement reçu", "inconnu": "Inconnu", "gainSessionMessage": "Gain de la session : {m}€ ({d} min)", "connexionInstableTitre": "Connexion instable", "connexionInstableMessage": "{eleve} s'est déconnecté — reconnexion possible sous {s}s.", "leleve": "L'élève", "enAttenteReconnexion": "⏳ En attente de reconnexion ({s}s)...", "reconnecteTitre": "Reconnecté", "reconnecteMessage": "{eleve} est de retour.", "paiementAttenteTitre": "Paiement en attente", "paiementAttenteMessageDefaut": "Le paiement de cette session est en attente de validation par l'élève.", "sessionNonFactureeTitre": "Session non facturée", "sessionNonFactureeMessage": "Cette session de {d} min était trop courte pour être facturée."}, "tdbEleve": {"appelEntrant": "Appel entrant...", "sessionTerminee": "Session terminée", "profNaPasRepondu": "Le professeur n'a pas répondu", "stripeConfigureTitre": "Compte Stripe configuré", "stripeConfigureTexte": "Vous pouvez recevoir des paiements de vos élèves.", "revenusAttenteTitre": "Revenus en attente", "revenusAttenteTexte": "Configurez votre compte pour recevoir vos virements.", "activerStripeConnect": "⚙️ Activer Stripe Connect", "redirection": "🔄 Redirection...", "fichierEnvoye": "Le fichier \"{nom}\" a été envoyé avec succès", "validationBancaireTitre": "Validation bancaire requise", "validationBancaireMessageDefaut": "Votre banque doit valider ce paiement.", "validerPaiementBtn": "Valider mon paiement", "profDeconnecteMessage": "{prof} s'est déconnecté — reconnexion possible sous {s}s.", "leprofDefaut": "Le professeur", "enAttenteRetourProf": "En attente du retour du professeur ({s}s)...", "profDeRetourMessage": "{prof} est de retour."}, "profs": {"enLigne": "En ligne"}},
"en": {"tdbProf": {"dispoLabel": "Available for calls:", "activerNotifications": "🔔 Enable notifications", "terminer": "✕ End", "vous": "You", "eleveLabel": "Student", "notePlateformeTitre": "Apple note:", "notePlateformeTexte": "The red icon in the status bar only indicates that the camera is active for the live lesson. Nothing is being recorded.", "tableauBlanc": "✏️ Whiteboard", "effacer": "Clear", "quitterPleinEcran": "❌ Exit", "quitterPleinEcranTitre": "Exit fullscreen", "envoyer": "Send", "appelsEntrantsTitre": "📞 Incoming calls", "aucunAppelEnCours": "No call in progress", "appelDunEleve": "Call from a student…", "accepter": "✅ Accept", "refuser": "✕ Decline", "stripeConnectTitre": "💳 Stripe Connect (Seller)", "stripeNecessaire": "Required to receive your payments.", "stripeConnecterBtn": "Connect my Stripe account", "gainsTitre": "Earnings pending transfer", "gainsModalTitre": "💶 My earnings", "gainsEnAttente": "pending bank transfer", "gainsDejaVerse": "Already paid: ", "fermer": "Close", "appelEnCours": "Calling...", "enCommunication": "In call", "monCompte": "My account", "utilisateurLabel": "User: ", "statutLabel": "Status: ", "abonne": "✅ Subscriber", "nonAbonne": "❌ Not a subscriber", "configurerStripe": "⚙️ Set up my Stripe account", "enregistrerCarte": "💳 Save my bank card", "erreurOuvertureStripe": "Unable to open the Stripe session.", "erreurLienStripe": "Unable to generate the Stripe link.", "erreurReseauStripe": "A network error occurred.", "stripeDejaConnecte": "Your Stripe account is already connected, or an error occurred.", "erreurDemarrageStripe": "Unable to start Stripe onboarding.", "erreurDispo": "Unable to change your availability right now.", "activerNotifsPourDispo": "Enable notifications to be able to go available.", "erreurPrefixe": "Error: ", "installTitre": "📲 Install the app", "installTexteAndroid": "To receive calls even when the app is closed, add this page to your home screen.", "installTexteIOS": "To receive calls even when the app is closed: tap <strong>Share</strong> ⬆️ then <strong>\"Add to Home Screen\"</strong>.", "installBtn": "Install", "installPlusTard": "Later", "installCompris": "Got it", "activerSon": "🔔 Turn on call sound", "deconnexionBtn": "🚪 Log out", "notifPaiementDefaut": "Payment received", "inconnu": "Unknown", "gainSessionMessage": "Session earnings: €{m} ({d} min)", "connexionInstableTitre": "Unstable connection", "connexionInstableMessage": "{eleve} disconnected — reconnection possible within {s}s.", "leleve": "The student", "enAttenteReconnexion": "⏳ Waiting for reconnection ({s}s)...", "reconnecteTitre": "Reconnected", "reconnecteMessage": "{eleve} is back.", "paiementAttenteTitre": "Payment pending", "paiementAttenteMessageDefaut": "Payment for this session is pending validation by the student.", "sessionNonFactureeTitre": "Session not billed", "sessionNonFactureeMessage": "This {d} min session was too short to be billed."}, "tdbEleve": {"appelEntrant": "Incoming call...", "sessionTerminee": "Session ended", "profNaPasRepondu": "The teacher did not answer", "stripeConfigureTitre": "Stripe account set up", "stripeConfigureTexte": "You can now receive payments from your students.", "revenusAttenteTitre": "Earnings pending", "revenusAttenteTexte": "Set up your account to receive your payouts.", "activerStripeConnect": "⚙️ Activate Stripe Connect", "redirection": "🔄 Redirecting...", "fichierEnvoye": "The file \"{nom}\" was sent successfully", "validationBancaireTitre": "Bank validation required", "validationBancaireMessageDefaut": "Your bank must validate this payment.", "validerPaiementBtn": "Validate my payment", "profDeconnecteMessage": "{prof} disconnected — reconnection possible within {s}s.", "leprofDefaut": "The teacher", "enAttenteRetourProf": "Waiting for the teacher to return ({s}s)...", "profDeRetourMessage": "{prof} is back."}, "profs": {"enLigne": "Online"}},
"es": {"tdbProf": {"dispoLabel": "Disponible para llamadas:", "activerNotifications": "🔔 Activar notificaciones", "terminer": "✕ Finalizar", "vous": "Tú", "eleveLabel": "Alumno", "notePlateformeTitre": "Nota de Apple:", "notePlateformeTexte": "El icono rojo en la barra de estado solo indica que la cámara está activa para la clase en directo. No se graba nada.", "tableauBlanc": "✏️ Pizarra", "effacer": "Borrar", "quitterPleinEcran": "❌ Salir", "quitterPleinEcranTitre": "Salir de pantalla completa", "envoyer": "Enviar", "appelsEntrantsTitre": "📞 Llamadas entrantes", "aucunAppelEnCours": "Ninguna llamada en curso", "appelDunEleve": "Llamada de un alumno…", "accepter": "✅ Aceptar", "refuser": "✕ Rechazar", "stripeConnectTitre": "💳 Stripe Connect (Vendedor)", "stripeNecessaire": "Necesario para recibir tus pagos.", "stripeConnecterBtn": "Conectar mi cuenta Stripe", "gainsTitre": "Ganancias pendientes de transferencia", "gainsModalTitre": "💶 Mis ganancias", "gainsEnAttente": "pendiente de transferencia bancaria", "gainsDejaVerse": "Ya transferido: ", "fermer": "Cerrar", "appelEnCours": "Llamando...", "enCommunication": "En comunicación", "monCompte": "Mi cuenta", "utilisateurLabel": "Usuario: ", "statutLabel": "Estado: ", "abonne": "✅ Suscrito", "nonAbonne": "❌ No suscrito", "configurerStripe": "⚙️ Configurar mi cuenta Stripe", "enregistrerCarte": "💳 Guardar mi tarjeta bancaria", "erreurOuvertureStripe": "No se pudo abrir la sesión de Stripe.", "erreurLienStripe": "No se pudo generar el enlace de Stripe.", "erreurReseauStripe": "Se produjo un error de red.", "stripeDejaConnecte": "Tu cuenta Stripe ya está conectada o se produjo un error.", "erreurDemarrageStripe": "No se pudo iniciar el proceso de Stripe.", "erreurDispo": "No se puede cambiar tu disponibilidad en este momento.", "activerNotifsPourDispo": "Activa las notificaciones para poder estar disponible.", "erreurPrefixe": "Error: ", "installTitre": "📲 Instala la aplicación", "installTexteAndroid": "Para recibir llamadas incluso con la app cerrada, añade esta página a tu pantalla de inicio.", "installTexteIOS": "Para recibir llamadas incluso con la app cerrada: toca <strong>Compartir</strong> ⬆️ y luego <strong>«Añadir a pantalla de inicio»</strong>.", "installBtn": "Instalar", "installPlusTard": "Más tarde", "installCompris": "Entendido", "activerSon": "🔔 Activar el sonido de llamadas", "deconnexionBtn": "🚪 Cerrar sesión", "notifPaiementDefaut": "Pago recibido", "inconnu": "Desconocido", "gainSessionMessage": "Ganancia de la sesión: {m}€ ({d} min)", "connexionInstableTitre": "Conexión inestable", "connexionInstableMessage": "{eleve} se ha desconectado — reconexión posible en {s}s.", "leleve": "El alumno", "enAttenteReconnexion": "⏳ Esperando reconexión ({s}s)...", "reconnecteTitre": "Reconectado", "reconnecteMessage": "{eleve} ha vuelto.", "paiementAttenteTitre": "Pago pendiente", "paiementAttenteMessageDefaut": "El pago de esta sesión está pendiente de validación por el alumno.", "sessionNonFactureeTitre": "Sesión no facturada", "sessionNonFactureeMessage": "Esta sesión de {d} min fue demasiado corta para ser facturada."}, "tdbEleve": {"appelEntrant": "Llamada entrante...", "sessionTerminee": "Sesión finalizada", "profNaPasRepondu": "El profesor no respondió", "stripeConfigureTitre": "Cuenta Stripe configurada", "stripeConfigureTexte": "Ya puedes recibir pagos de tus alumnos.", "revenusAttenteTitre": "Ingresos pendientes", "revenusAttenteTexte": "Configura tu cuenta para recibir tus transferencias.", "activerStripeConnect": "⚙️ Activar Stripe Connect", "redirection": "🔄 Redirigiendo...", "fichierEnvoye": "El archivo \"{nom}\" se envió correctamente", "validationBancaireTitre": "Validación bancaria requerida", "validationBancaireMessageDefaut": "Tu banco debe validar este pago.", "validerPaiementBtn": "Validar mi pago", "profDeconnecteMessage": "{prof} se ha desconectado — reconexión posible en {s}s.", "leprofDefaut": "El profesor", "enAttenteRetourProf": "Esperando el regreso del profesor ({s}s)...", "profDeRetourMessage": "{prof} ha vuelto."}, "profs": {"enLigne": "En línea"}},
"ar": {"tdbProf": {"dispoLabel": "متاح للمكالمات:", "activerNotifications": "🔔 تفعيل الإشعارات", "terminer": "✕ إنهاء", "vous": "أنت", "eleveLabel": "التلميذ", "notePlateformeTitre": "ملاحظة من آبل:", "notePlateformeTexte": "الأيقونة الحمراء في شريط الحالة تشير فقط إلى أن الكاميرا نشطة أثناء الدرس المباشر. لا يتم تسجيل أي شيء.", "tableauBlanc": "✏️ السبورة", "effacer": "مسح", "quitterPleinEcran": "❌ خروج", "quitterPleinEcranTitre": "الخروج من ملء الشاشة", "envoyer": "إرسال", "appelsEntrantsTitre": "📞 المكالمات الواردة", "aucunAppelEnCours": "لا توجد مكالمة جارية", "appelDunEleve": "مكالمة من تلميذ…", "accepter": "✅ قبول", "refuser": "✕ رفض", "stripeConnectTitre": "💳 Stripe Connect (البائع)", "stripeNecessaire": "ضروري لاستلام مدفوعاتك.", "stripeConnecterBtn": "ربط حساب Stripe الخاص بي", "gainsTitre": "أرباح في انتظار التحويل", "gainsModalTitre": "💶 أرباحي", "gainsEnAttente": "في انتظار التحويل البنكي", "gainsDejaVerse": "تم تحويله بالفعل: ", "fermer": "إغلاق", "appelEnCours": "جارٍ الاتصال...", "enCommunication": "في اتصال", "monCompte": "حسابي", "utilisateurLabel": "المستخدم: ", "statutLabel": "الحالة: ", "abonne": "✅ مشترك", "nonAbonne": "❌ غير مشترك", "configurerStripe": "⚙️ إعداد حساب Stripe الخاص بي", "enregistrerCarte": "💳 تسجيل بطاقتي البنكية", "erreurOuvertureStripe": "تعذّر فتح جلسة Stripe.", "erreurLienStripe": "تعذّر إنشاء رابط Stripe.", "erreurReseauStripe": "حدث خطأ في الشبكة.", "stripeDejaConnecte": "حسابك في Stripe متصل بالفعل أو حدث خطأ.", "erreurDemarrageStripe": "تعذّر بدء إعداد Stripe.", "erreurDispo": "تعذّر تغيير حالة توفرك في الوقت الحالي.", "activerNotifsPourDispo": "فعّل الإشعارات لتتمكن من أن تكون متاحاً.", "erreurPrefixe": "خطأ: ", "installTitre": "📲 ثبّت التطبيق", "installTexteAndroid": "لتلقي المكالمات حتى عند إغلاق التطبيق، أضف هذه الصفحة إلى شاشتك الرئيسية.", "installTexteIOS": "لتلقي المكالمات حتى عند إغلاق التطبيق: اضغط على <strong>مشاركة</strong> ⬆️ ثم <strong>«على الشاشة الرئيسية»</strong>.", "installBtn": "تثبيت", "installPlusTard": "لاحقاً", "installCompris": "فهمت", "activerSon": "🔔 تفعيل صوت المكالمات", "deconnexionBtn": "🚪 تسجيل الخروج", "notifPaiementDefaut": "تم استلام الدفع", "inconnu": "غير معروف", "gainSessionMessage": "أرباح الجلسة: {m}€ ({d} د)", "connexionInstableTitre": "اتصال غير مستقر", "connexionInstableMessage": "{eleve} انقطع اتصاله — إعادة الاتصال ممكنة خلال {s} ثانية.", "leleve": "التلميذ", "enAttenteReconnexion": "⏳ في انتظار إعادة الاتصال ({s} ثانية)...", "reconnecteTitre": "تمت إعادة الاتصال", "reconnecteMessage": "{eleve} عاد الآن.", "paiementAttenteTitre": "الدفع قيد الانتظار", "paiementAttenteMessageDefaut": "دفع هذه الجلسة في انتظار تأكيد التلميذ.", "sessionNonFactureeTitre": "جلسة غير مفوترة", "sessionNonFactureeMessage": "كانت هذه الجلسة التي دامت {d} د قصيرة جداً لفوترتها."}, "tdbEleve": {"appelEntrant": "مكالمة واردة...", "sessionTerminee": "انتهت الجلسة", "profNaPasRepondu": "لم يرد الأستاذ", "stripeConfigureTitre": "تم إعداد حساب Stripe", "stripeConfigureTexte": "يمكنك الآن استلام مدفوعات تلاميذك.", "revenusAttenteTitre": "أرباح قيد الانتظار", "revenusAttenteTexte": "أعدّ حسابك لاستلام تحويلاتك.", "activerStripeConnect": "⚙️ تفعيل Stripe Connect", "redirection": "🔄 جارٍ التوجيه...", "fichierEnvoye": "تم إرسال الملف «{nom}» بنجاح", "validationBancaireTitre": "التحقق البنكي مطلوب", "validationBancaireMessageDefaut": "يجب على بنكك تأكيد هذا الدفع.", "validerPaiementBtn": "تأكيد دفعتي", "profDeconnecteMessage": "{prof} انقطع اتصاله — إعادة الاتصال ممكنة خلال {s} ثانية.", "leprofDefaut": "الأستاذ", "enAttenteRetourProf": "في انتظار عودة الأستاذ ({s} ثانية)...", "profDeRetourMessage": "{prof} عاد الآن."}, "profs": {"enLigne": "متصل"}}
};
const LANGS = ["fr", "en", "es", "ar"];

const lines = [];
let fatal = false;
const say = (s) => lines.push(s);
const bad = (s) => { fatal = true; lines.push("  ERREUR  " + s); };
const warn = (s) => lines.push("  attention  " + s);

const readText = (f) => fs.readFileSync(f, "utf8");
const countOcc = (s, sub) => { let c = 0, i = 0; while ((i = s.indexOf(sub, i)) !== -1) { c++; i += sub.length; } return c; };
const rel = (f) => path.relative(ROOT, f);

if (!fs.existsSync(PUB)) {
  console.log("ERREUR : dossier 'public' introuvable. Lancez ce script depuis la racine du projet (plateforme_scolaire).");
  process.exit(1);
}

// ---------- 1. Remplacements dans les fichiers JS / HTML ----------
const pending = []; // { file, content }
const finalTexts = {}; // pour la verification des cles

function patchFile(label, file, patches, isJs) {
  say("");
  say("[" + label + "] " + rel(file));
  if (!file || !fs.existsSync(file)) { bad("fichier introuvable"); return; }
  const original = readText(file);
  let content = original;
  let applied = 0, already = 0, skipped = 0;
  for (const p of patches) {
    const nNew = countOcc(content, p.neu);
    const nOld = countOcc(content, p.old);
    if (nNew >= p.count) { already++; continue; }            // deja applique
    if (nOld === p.count) { content = content.split(p.old).join(p.neu); applied++; continue; }
    const msg = "motif attendu " + p.count + "x, trouve " + nOld + "x : " + p.old.slice(0, 80);
    if (p.optional) { skipped++; warn("(optionnel, ignore) " + msg); } else { bad(msg); }
  }
  say("  " + applied + " remplacement(s) a appliquer, " + already + " deja applique(s)" + (skipped ? ", " + skipped + " ignore(s)" : ""));
  finalTexts[file] = content;
  if (content !== original) pending.push({ file, content });
  if (isJs && content !== original) {
    const tmp = path.join(os.tmpdir(), "i18n_check_" + Date.now() + "_" + path.basename(file, ".js") + ".mjs");
    fs.writeFileSync(tmp, content, "utf8");
    try { cp.execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" }); say("  syntaxe JS : OK"); }
    catch (e) { bad("syntaxe JS invalide apres modification : " + String(e.stderr || e.message).split("\n").slice(0, 4).join(" | ")); }
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

const eleveJs = path.join(PUB, "js", "pages", "eleve", "dashboard.js");
const eleveSock = path.join(PUB, "js", "core", "socket.handler.eleve.js");
patchFile("Dashboard eleve (JS)", eleveJs, ELEVE_DASHBOARD_JS, true);
patchFile("Socket handler eleve (JS)", eleveSock, ELEVE_SOCKET_JS, true);

// HTML eleve : on retrouve le fichier qui charge js/pages/eleve/dashboard.js
let eleveHtml = null;
const htmlDir = path.join(PUB, "pages", "eleve");
if (fs.existsSync(htmlDir)) {
  for (const f of fs.readdirSync(htmlDir)) {
    if (!f.toLowerCase().endsWith(".html")) continue;
    const full = path.join(htmlDir, f);
    if (readText(full).includes("js/pages/eleve/dashboard.js")) { eleveHtml = full; break; }
  }
}
if (eleveHtml) patchFile("Dashboard eleve (HTML)", eleveHtml, ELEVE_HTML, false);
else { say(""); warn("HTML du dashboard eleve non trouve dans public/pages/eleve (partie HTML ignoree)"); }

// ---------- 2. Fichiers de langue : ajout des cles manquantes ----------
say("");
say("[Fichiers de langue] public/locales");
const newLocales = {};
for (const lang of LANGS) {
  const f = path.join(PUB, "locales", lang + ".json");
  if (!fs.existsSync(f)) { bad(lang + ".json introuvable"); continue; }
  let data;
  try { data = JSON.parse(readText(f).replace(/^\uFEFF/, "")); }
  catch (e) { bad(lang + ".json illisible : " + e.message); continue; }
  let added = 0, changed = 0;
  for (const [section, keys] of Object.entries(LOCALE_ADD[lang])) {
    if (!data[section] || typeof data[section] !== "object") data[section] = {};
    for (const [k, v] of Object.entries(keys)) {
      if (!(k in data[section])) { data[section][k] = v; added++; }
      else if (data[section][k] !== v) { data[section][k] = v; changed++; }
    }
  }
  const text = JSON.stringify(data, null, 2) + "\n";
  try { JSON.parse(text); } catch (e) { bad(lang + ".json invalide apres fusion"); continue; }
  newLocales[lang] = data;
  say("  " + lang + ".json : " + added + " cle(s) ajoutee(s), " + changed + " mise(s) a jour");
  if (added || changed) pending.push({ file: f, content: text });
}

// ---------- 3. Verification : chaque cle utilisee existe dans les 4 langues ----------
say("");
say("[Verification des cles de traduction]");
const lookup = (obj, key) => key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
const KEY_RE = /\btf?\(\s*(["'])([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)\1/g;
const ATTR_RE = /data-i18n(?:-title|-placeholder)?="([^"]+)"/g;
function keysOf(text) {
  const s = new Set(); let m;
  KEY_RE.lastIndex = 0; while ((m = KEY_RE.exec(text))) s.add(m[2]);
  ATTR_RE.lastIndex = 0; while ((m = ATTR_RE.exec(text))) s.add(m[1]);
  return s;
}
function checkKeys(label, text, strict) {
  const keys = keysOf(text); let miss = 0;
  for (const k of keys) for (const lang of LANGS) {
    if (!newLocales[lang]) continue;
    if (typeof lookup(newLocales[lang], k) !== "string") { miss++; (strict ? bad : warn)(label + " : cle absente en " + lang + " -> " + k); }
  }
  say("  " + label + " : " + keys.size + " cle(s) utilisee(s)" + (miss ? ", " + miss + " manquante(s)" : ", toutes presentes dans les 4 langues"));
}
for (const [f, text] of Object.entries(finalTexts)) checkKeys(rel(f), text, true);

// Fichiers du professeur (lecture seule, information)
const profFiles = [
  path.join(PUB, "js", "pages", "professeur", "dashboard.js"),
  path.join(PUB, "js", "core", "socket.handler.js"),
  path.join(PUB, "pages", "professeur", "dashboard.html"),
];
for (const f of profFiles) if (fs.existsSync(f)) checkKeys(rel(f) + " (prof, lecture seule)", readText(f), false);
const profSock = path.join(PUB, "js", "core", "socket.handler.js");
if (fs.existsSync(profSock)) {
  const done = readText(profSock).includes("tdbProf.connexionInstableTitre");
  say("  socket.handler.js du PROF : " + (done ? "deja traduit" : "PAS ENCORE traduit (a appliquer separement)"));
}

// ---------- 4. Bilan / ecriture ----------
say("");
if (fatal) {
  say("=> ARRET : au moins une verification a echoue. AUCUN fichier n'a ete modifie.");
} else if (!pending.length) {
  say("=> Rien a faire : tout est deja applique.");
} else if (!APPLY) {
  say("=> SIMULATION reussie (" + pending.length + " fichier(s) seraient modifies). Rien n'a ete ecrit.");
  say("   Pour appliquer : node patch_i18n.cjs --apply");
} else {
  const d = new Date(), pad = (n) => String(n).padStart(2, "0");
  const stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  const bdir = path.join(ROOT, "backup_i18n_" + stamp);
  for (const { file } of pending) {
    const dest = path.join(bdir, path.relative(ROOT, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }
  for (const { file, content } of pending) fs.writeFileSync(file, content, "utf8");
  say("=> APPLIQUE : " + pending.length + " fichier(s) modifies. Sauvegarde des originaux : " + path.relative(ROOT, bdir));
}
console.log(lines.join("\n"));
process.exit(fatal ? 1 : 0);