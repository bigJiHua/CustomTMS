-- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- 主机： 127.0.0.1:3306
-- 生成日期： 2025-12-20 04:26:37
-- 服务器版本： 5.7.40
-- PHP 版本： 8.0.26

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- 数据库： `tms`
--

-- --------------------------------------------------------

--
-- 表的结构 `movie_sources`
--

DROP TABLE IF EXISTS `movie_sources`;
CREATE TABLE IF NOT EXISTS `movie_sources` (
  `id` int(20) NOT NULL AUTO_INCREMENT,
  `movie_source_id` varchar(255) NOT NULL COMMENT '关联ID',
  `movie_name` varchar(191) NOT NULL COMMENT '影片名称',
  `duration_seconds` int(11) NOT NULL COMMENT '影片时长（秒）',
  `light_offset_seconds` int(11) NOT NULL COMMENT '开灯提前量（秒）',
  `egg` varchar(255) NOT NULL DEFAULT '0' COMMENT '是否有彩蛋',
  `release_date` date DEFAULT NULL COMMENT '上映日期',
  `valid_until` date NOT NULL COMMENT '有效期截止日期（默认上映后2个月）',
  `status` tinyint(4) NOT NULL DEFAULT '1' COMMENT '状态：1=有效 0=过期',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` varchar(255) DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_movie_name` (`movie_name`),
  KEY `idx_status` (`status`),
  KEY `idx_valid_until` (`valid_until`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `schedules`
--

DROP TABLE IF EXISTS `schedules`;
CREATE TABLE IF NOT EXISTS `schedules` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `show_date` varchar(20) DEFAULT NULL COMMENT '放映日期',
  `movie_name` varchar(255) NOT NULL COMMENT '电影名称',
  `hall_name` varchar(64) NOT NULL COMMENT '影厅',
  `movie_source_id` varchar(20) DEFAULT NULL COMMENT '关联片源',
  `start_time` varchar(20) NOT NULL COMMENT '放映日期',
  `source` enum('manual','excel','api') NOT NULL DEFAULT 'manual' COMMENT '数据来源',
  `created_by` varchar(255) NOT NULL COMMENT '创建人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` varchar(255) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_show_date` (`show_date`),
  KEY `idx_hall_date` (`hall_name`,`show_date`),
  KEY `idx_movie` (`movie_source_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- 表的结构 `system_settings`
--

DROP TABLE IF EXISTS `system_settings`;
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `group_key` varchar(64) NOT NULL COMMENT '配置分组，如 site、seo、upload、crawler',
  `setting_key` varchar(64) NOT NULL COMMENT '配置键，如 site_name、enable_register',
  `setting_value` mediumtext NOT NULL COMMENT '配置值，支持字符串 / JSON',
  `value_type` enum('string','number','boolean','json') NOT NULL DEFAULT 'string' COMMENT '值类型，用于解析与展示控制',
  `description` varchar(255) DEFAULT NULL COMMENT '配置项说明',
  `updated_by` varchar(64) NOT NULL COMMENT '最后修改人',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后修改时间',
  `is_system` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否系统保留项（0=是，1=否）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_setting` (`group_key`,`setting_key`),
  KEY `idx_group` (`group_key`),
  KEY `idx_setting` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置中心表';

-- --------------------------------------------------------

--
-- 表的结构 `users`
--

DROP TABLE IF EXISTS `users`;
CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','editor','viewer') NOT NULL DEFAULT 'viewer',
  `is_active` tinyint(4) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
