// =======================================================
// AppelModel – Sequelize adapté à la table existante
// =======================================================

import { DataTypes, Model } from "sequelize";
import { sequelize } from "#config/index.js";

class AppelModel extends Model {}

AppelModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    prof_username: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    eleve_username: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    start_time: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    end_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    duree_minutes: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    statut: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "en_cours",
    },
  },
  {
    sequelize,
    modelName: "Appel",
    tableName: "appels",
    timestamps: false, // pas de createdAt / updatedAt
  }
);

export default AppelModel;
