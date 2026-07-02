package com.standupsync.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("sprint")
public class Sprint {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long teamId;
    private String name;
    private LocalDate startDate;
    private LocalDate endDate;
    private Integer isActive;
    @TableLogic
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
