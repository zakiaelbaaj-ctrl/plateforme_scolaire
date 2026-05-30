// ======================================================
// MATCHING CONTROLLER (ÉTUDIANT ↔ ÉTUDIANT)
// Gestion de la file d'attente et mise en relation
// ======================================================

import * as mailService from "../services/mail.service.js";
import logger from "../config/logger.js";
import User from "../models/user.model.js"; 

// File d'attente en mémoire
const matchingQueue = {};

export const matchingController = {

    /**
     * Ajoute un étudiant à la file d'attente
     */
    async enqueue(req, res) {
        try {
            const { userId } = req.user; 
            const { matiere, sujet } = req.body;

            if (!matiere) {
                return res.status(400).json({ success: false, message: "Matière requise" });
            }

            // 1. Récupérer les infos de l'étudiant
            const student = await User.findByPk(userId);
            if (!student) {
                return res.status(404).json({ success: false, message: "Étudiant introuvable" });
            }

            // 2. Initialiser la file pour cette matière
            if (!matchingQueue[matiere]) {
                matchingQueue[matiere] = [];
            }

            // 3. Éviter les doublons dans la file
            const isAlreadyIn = matchingQueue[matiere].some(s => s.userId === userId);
            if (isAlreadyIn) {
                return res.status(200).json({ success: true, message: "Déjà en file d'attente", matchFound: false });
            }

            // 4. TENTATIVE DE MATCHING
            if (matchingQueue[matiere].length > 0) {
                // On extrait le partenaire qui attend depuis le plus longtemps (FIFO)
                const partner = matchingQueue[matiere].shift();

                logger.info(`🎯 MATCH TROUVÉ en ${matiere} : ${student.prenom} ↔ ${partner.prenom}`);

                // 5. ENVOI DES EMAILS (Asynchrone pour ne pas bloquer la réponse)
                mailService.sendMatchFoundEmail(student, partner.prenom).catch(err => 
                    logger.error("Erreur mail matching (student):", err)
                );
                
                // Note : Pour le partenaire, on passe l'objet complet ou ses infos stockées
                mailService.sendMatchFoundEmail(partner, student.prenom).catch(err => 
                    logger.error("Erreur mail matching (partner):", err)
                );

                // 6. Réponse de succès de match
                return res.status(200).json({
                    success: true,
                    matchFound: true,
                    roomId: `room_${partner.userId}_${student.id}`,
                    partnerName: partner.prenom
                });
            }

            // 7. SI PAS DE MATCH : On ajoute l'étudiant à la file d'attente
            matchingQueue[matiere].push({
                userId: student.id,
                prenom: student.prenom,
                email: student.email,
                sujet: sujet || ""
            });

            logger.info(`⏳ Étudiant ${student.prenom} ajouté à la file d'attente (${matiere})`);

            return res.status(200).json({
                success: true,
                matchFound: false,
                message: "Placé en file d'attente"
            });

        } catch (err) {
            logger.error("Matching enqueue error:", err);
            return res.status(500).json({ success: false, message: "Erreur lors du matching" });
        }
    },

    /**
     * Retire un étudiant de la file d'attente (annulation)
     */
    async dequeue(req, res) {
        try {
            const { userId } = req.user;
            
            let removed = false;
            Object.keys(matchingQueue).forEach(matiere => {
                const initialLength = matchingQueue[matiere].length;
                matchingQueue[matiere] = matchingQueue[matiere].filter(s => s.userId !== userId);
                if (matchingQueue[matiere].length < initialLength) removed = true;
            });

            if (removed) {
                logger.info(`🚫 Étudiant ${userId} retiré des files d'attente`);
            }

            return res.status(200).json({ success: true, message: "Retiré de la file d'attente" });
        } catch (err) {
            logger.error("Matching dequeue error:", err);
            return res.status(500).json({ success: false, message: "Erreur dequeue" });
        }
    }
};
