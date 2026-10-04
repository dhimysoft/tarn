"use strict";

/**
 * Creates the session table used by connect-pg-simple.
 *
 * The library can create this itself at boot, but then the schema would live
 * outside migrations and differ between environments depending on start order.
 * Creating it here keeps every table under version control.
 *
 * Column names and types are fixed by connect-pg-simple and must not be
 * renamed to match the project's other tables.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("session", {
      sid: { type: Sequelize.STRING, primaryKey: true, allowNull: false },
      sess: { type: Sequelize.JSON, allowNull: false },
      expire: { type: "TIMESTAMP(6)", allowNull: false },
    });

    // connect-pg-simple sweeps expired rows using this index.
    await queryInterface.addIndex("session", ["expire"], {
      name: "session_expire_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("session");
  },
};
