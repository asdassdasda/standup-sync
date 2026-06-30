<template>
  <div style="display: flex; justify-content: center; align-items: center; height: 100vh;">
    <el-result icon="error" title="404" sub-title="页面不存在">
      <template #extra>
        <el-button type="primary" @click="$router.push('/')">返回首页</el-button>
      </template>
    </el-result>
  </div>
</template>
