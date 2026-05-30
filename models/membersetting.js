"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
    class MemberSetting extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
        }
    }
    MemberSetting.init(
        {
            memberid: DataTypes.STRING,
            name: DataTypes.STRING,
            type: DataTypes.STRING,
            description: DataTypes.STRING,
            value: DataTypes.STRING,
        },
        {
            sequelize,
            modelName: "MemberSetting",
        }
    );
    return MemberSetting;
};
