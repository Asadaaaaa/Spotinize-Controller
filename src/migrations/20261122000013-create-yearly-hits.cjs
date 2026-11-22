'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('yearly_hits', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      year: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true
      },
      label: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    const tableInfo = await queryInterface.describeTable('tracks');
    if (!tableInfo.yearly_hit_id) {
      await queryInterface.addColumn('tracks', 'yearly_hit_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'yearly_hits',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      await queryInterface.addIndex('tracks', ['yearly_hit_id'], { name: 'idx_tracks_yearly_hit_id' });
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('tracks');
    if (tableInfo.yearly_hit_id) {
      await queryInterface.removeIndex('tracks', 'idx_tracks_yearly_hit_id').catch(() => {});
      await queryInterface.removeColumn('tracks', 'yearly_hit_id');
    }
    await queryInterface.dropTable('yearly_hits');
  }
};
